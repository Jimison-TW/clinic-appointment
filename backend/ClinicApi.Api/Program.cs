using System.Text;
using ClinicApi.Api.Auth;
using ClinicApi.Api.Data;
using ClinicApi.Api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;

var builder = WebApplication.CreateBuilder(args);

// ---------- 設定 ----------
builder.Services.Configure<JwtSettings>(builder.Configuration.GetSection("Jwt"));
var jwt = builder.Configuration.GetSection("Jwt").Get<JwtSettings>()
          ?? throw new InvalidOperationException("appsettings.json 缺少 Jwt 區段");
if (string.IsNullOrWhiteSpace(jwt.Key))
    throw new InvalidOperationException(
        "JWT 金鑰是空的。請執行：dotnet user-secrets set \"Jwt:Key\" \"$(openssl rand -base64 48)\"");

// ---------- 服務 ----------
builder.Services.AddDbContext<ClinicDbContext>(options =>
    options
        .UseNpgsql(builder.Configuration.GetConnectionString("ClinicDb"))
        .UseSnakeCaseNamingConvention());

builder.Services.AddScoped<ITokenService, TokenService>();

// ---------- 認證（你是誰）----------
builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer           = true,
            ValidIssuer              = jwt.Issuer,
            ValidateAudience         = true,
            ValidAudience            = jwt.Audience,
            ValidateLifetime         = true,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey         = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.Key)),

            // ⚠️ 坑 #2：ClockSkew 預設是 5 分鐘（容忍伺服器時鐘誤差）。
            //    你設 access token 15 分鐘，實際上要 20 分鐘才真的失效。
            ClockSkew = TimeSpan.FromSeconds(30),

            // 告訴 ASP.NET：User.Identity.Name 去讀哪個 claim、[Authorize(Roles=...)] 去讀哪個
            NameClaimType = "name",
            RoleClaimType = "role",
        };

        // ⚠️ 坑 #1：預設 .NET 會把 JWT 的短名稱 claim 改寫成一長串微軟 URI，
        //    "sub" -> "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier"
        //    結果你在 Controller 找 User.FindFirstValue("sub") 永遠拿到 null。
        //    關掉這個改寫，claim 名稱維持 token 裡的原樣。
        //
        //    ⚠️ 網路上很多文章教你寫
        //        JwtSecurityTokenHandler.DefaultInboundClaimTypeMap.Clear();
        //      那是 .NET 7 以前的做法。.NET 8 的 JwtBearer 改用 JsonWebTokenHandler，
        //      它有自己的一張對照表，清舊的那張完全沒有作用（而且不會有任何錯誤訊息）。
        //      MapInboundClaims = false 才是 .NET 8 的正解。
        options.MapInboundClaims = false;
    });

// ---------- 授權（你能做什麼）----------
builder.Services.AddAuthorization();

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();

// ---------- Swagger 加上 Bearer 按鈕 ----------
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo { Title = "Clinic API", Version = "v1" });

    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name        = "Authorization",
        Type        = SecuritySchemeType.Http,
        Scheme      = "bearer",
        BearerFormat= "JWT",
        In          = ParameterLocation.Header,
        Description = "貼上 access token 就好，不用自己加 \"Bearer \" 前綴。",
    });

    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference
                {
                    Type = ReferenceType.SecurityScheme,
                    Id   = "Bearer",
                },
            },
            Array.Empty<string>()
        }
    });
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();

// ⚠️ 坑 #3：順序不能顛倒，而且兩個都不能少。
//    UseAuthentication 先跑（解析 token -> 填好 HttpContext.User），
//    UseAuthorization 才有東西可以檢查。
//    寫反了不會報錯，只會讓每個 [Authorize] 都變成 401——靜默失效，超難debug。
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.Run();

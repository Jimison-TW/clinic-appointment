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

// ---------- CORS（誰的網頁可以打我）----------
//
// 為什麼要明列 origin 而不是 AllowAnyOrigin()：
//   AllowAnyOrigin() 會回 `Access-Control-Allow-Origin: *`。
//   萬一之後改用 cookie 帶身分（AllowCredentials），瀏覽器規格明文禁止
//   `*` 搭配 credentials —— 到那天整條線會突然壞掉，而且錯誤訊息很不直覺。
//   現在就明列，之後改 cookie 不用回頭改這裡。
//
// 為什麼「不」加 AllowCredentials()：
//   我們的身分是放在 Authorization header 的 Bearer token，
//   不是瀏覽器自動附帶的 cookie。開 AllowCredentials 對我們沒有任何好處，
//   只是白白允許跨站自動帶憑證 = 多開一個 CSRF 面。
//
// AllowAnyHeader 是必要的：前端會送 Authorization + Content-Type，
// 這兩個都不在 CORS 的「安全清單」內，沒放行的話 preflight 就過不了。
const string FrontendCors = "frontend";
builder.Services.AddCors(options =>
{
    options.AddPolicy(FrontendCors, policy => policy
        .WithOrigins("http://localhost:5173")   // Vite dev server
        .AllowAnyHeader()
        .AllowAnyMethod());
});

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

// ⚠️ 坑 #4（口訣 113）：UseHttpsRedirection 會用 307 吃掉 preflight。
//    瀏覽器送的 preflight 是 OPTIONS http://localhost:5080/api/auth/me，
//    這個 middleware 會回 307 Location: https://localhost:7101/...。
//    而 CORS 規格規定：preflight 的回應「不得重新導向」，瀏覽器不會跟隨，
//    直接判定 preflight 失敗 —— 主控台只會說 CORS error，完全看不出是 307 幹的。
//    Dev 環境前端本來就打 http:5080，這裡直接關掉；正式環境才需要強制升級 https。
if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}

// UseRouting 其實會被自動插在管線最前面，這裡明寫出來只是為了讓下面的順序一目了然。
app.UseRouting();

// ⚠️⚠️ 坑 #5（口訣 112）：UseCors 必須排在 UseAuthentication 之前。
//    CORS middleware 的工作是「在回應出去的路上補 Access-Control-Allow-Origin」。
//    如果排在 Authentication/Authorization 後面，一旦 token 過期，
//    401 會在還沒走到 CORS middleware 之前就被短路回傳 ->
//    這個 401 身上沒有 CORS header ->
//    瀏覽器不把回應交給 JS，axios 拿到的是 Network Error 而不是 status 401 ->
//    我們寫在攔截器裡的「401 就自動 refresh」永遠不會觸發，
//    畫面只會靜靜地失敗，主控台一片 CORS 紅字。
//
//    一句話：CORS 沒過的錯誤會蓋掉真正的錯誤。要先讓瀏覽器看得到 401，才談得上處理 401。
app.UseCors(FrontendCors);

// ⚠️ 坑 #3：順序不能顛倒，而且兩個都不能少。
//    UseAuthentication 先跑（解析 token -> 填好 HttpContext.User），
//    UseAuthorization 才有東西可以檢查。
//    寫反了不會報錯，只會讓每個 [Authorize] 都變成 401——靜默失效，超難debug。
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.Run();

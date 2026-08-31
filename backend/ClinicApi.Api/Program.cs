using ClinicApi.Api.Data;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// EF Core：註冊 ClinicDbContext，生命週期預設 Scoped（一個 HTTP 請求一份）
builder.Services.AddDbContext<ClinicDbContext>(options =>
    options
        .UseNpgsql(builder.Configuration.GetConnectionString("ClinicDb"))
        .UseSnakeCaseNamingConvention());

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();
app.UseAuthorization();
app.MapControllers();

app.Run();

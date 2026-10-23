FROM mcr.microsoft.com/dotnet/sdk:10.0.402 AS build
WORKDIR /src
COPY global.json ./
COPY src/Watchdog.Contracts/ src/Watchdog.Contracts/
COPY src/Watchdog.Web/ src/Watchdog.Web/
RUN dotnet restore src/Watchdog.Web/Watchdog.Web.csproj --locked-mode
RUN dotnet publish src/Watchdog.Web/Watchdog.Web.csproj -c Release --no-restore -o /out

FROM mcr.microsoft.com/dotnet/aspnet:10.0.13-bookworm-slim AS runtime
WORKDIR /app
ARG VERSION=0.1.0
ARG VCS_REF=unknown
ARG SOURCE_URL=https://github.com/Ding-Ding-Projects/watchdog-control
ENV ASPNETCORE_ENVIRONMENT=Production
ENV WATCHDOG_DATA_PATH=/var/lib/watchdog-control
EXPOSE 8443
LABEL org.opencontainers.image.title="Watchdog Control" \
      org.opencontainers.image.source=$SOURCE_URL \
      org.opencontainers.image.revision=$VCS_REF \
      org.opencontainers.image.version=$VERSION
COPY --from=build --chown=$APP_UID:$APP_UID /out/ ./
RUN mkdir -p /var/lib/watchdog-control \
    && chown $APP_UID:$APP_UID /var/lib/watchdog-control
USER $APP_UID
HEALTHCHECK --interval=20s --timeout=5s --start-period=20s --retries=3 CMD ["dotnet", "Watchdog.Web.dll", "--healthcheck"]
ENTRYPOINT ["dotnet", "Watchdog.Web.dll"]

# WP-01: наблюдение среды проверок

2026-11-02, `docker version --format '{{.Server.Version}}'` вернул exit 1: `failed to connect to the docker API ... .docker/run/docker.sock: connect: no such file or directory`. Это наблюдение текущего Docker endpoint, не утверждение о состоянии любых других контейнерных хостов. Docker или системные сервисы не запускались и не менялись. Live Neo4j/Docker negative fixture для BA→SA coverage и full gateway остаётся NOT_RUN; локальная JS-модель и sanitizer описаны отдельно.

DNS graph.itsalt.ru разрешился в 82.202.156.157; TCP 443 и 22 истекали при connect timeout, ранее MCP initialize timeout. Это не устанавливает причину (сеть, сервис, firewall и др.) и не доказывает состояние графа. Не применять общий import/reset, не считать task claim project mutex. См. WP-01-graph-baseline-risks.md.

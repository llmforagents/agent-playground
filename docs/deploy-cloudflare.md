# Deploy a Cloudflare Pages

Guía para publicar el dashboard en Cloudflare Pages desde un repo en GitLab, con deploys manuales desde tu máquina.

**Importante:** este flujo no afecta el setup local. Podés seguir usando `http://skywalker:4301` con `systemd` para testear sin parar. El deploy a Pages es un paso independiente.

---

## Requisitos (una sola vez)

1. **Cuenta de Cloudflare** (gratis alcanza).
2. **Autenticar wrangler** con tu cuenta:
   ```bash
   npx wrangler login
   ```
   Abre el browser, autoriza, listo.

3. **Crear el Pages project** (una sola vez):
   ```bash
   npx wrangler pages project create llm4agents-dashboard --production-branch main
   ```
   Te devuelve la URL `https://llm4agents-dashboard.pages.dev`.

---

## Deploy

```bash
./scripts/deploy-cloudflare.sh
```

El script:
1. Corre typecheck + tests (si falla algo, aborta antes de publicar).
2. Hace `npm run build` → genera `dist/` con `.env.production` (URLs públicas del API).
3. Sube `dist/` a CF Pages usando `wrangler pages deploy`.
4. Te imprime la URL del deploy.

Para un deploy de **preview** (no pisa producción):
```bash
./scripts/deploy-cloudflare.sh --preview
```

---

## Workflow recomendado

**Ciclo local:**
```bash
# Editar código…
./scripts/dashboard-service.sh rebuild   # refresca el servidor en skywalker:4301
```

**Push a GitLab:**
```bash
git add .
git commit -m "feat: …"
git push origin main
```
(El push a GitLab **no dispara** ningún deploy. GitLab guarda el código, nada más.)

**Deploy a CF Pages** (cuando quieras publicar):
```bash
./scripts/deploy-cloudflare.sh
```

---

## Primer push a GitLab

Una sola vez, después de crear el repo vacío en GitLab:

```bash
git remote add origin git@gitlab.com:TU_USUARIO/llm4agents-dashboard.git
git branch -M main
git push -u origin main
```

Si preferís HTTPS:
```bash
git remote add origin https://gitlab.com/TU_USUARIO/llm4agents-dashboard.git
```

---

## Custom domain (opcional)

En el Cloudflare dashboard → Pages → `llm4agents-dashboard` → Custom domains → Add domain. Agregás por ejemplo `dashboard.tudominio.com`, CF te da las instrucciones DNS.

---

## Qué queda donde

| | Local (skywalker) | CF Pages |
|---|---|---|
| URL | `http://skywalker:4301` | `https://llm4agents-dashboard.pages.dev` |
| Env | `.env.local` (git-ignored) | `.env.production` (committed) |
| Cómo se sirve | `npm run preview` vía systemd | Cloudflare CDN estático |
| Cuándo se actualiza | `./scripts/dashboard-service.sh rebuild` | `./scripts/deploy-cloudflare.sh` |
| IndexedDB | per-origin `skywalker:4301` | per-origin `*.pages.dev` |

Los datos locales NO se comparten entre ambas URLs (orígenes distintos). Si registrás un agente en skywalker, no aparece en el deploy de CF, y viceversa. Esto es normal y esperado.

---

## Consideraciones

- **API key expuesta**: la app guarda keys en IndexedDB del navegador y las manda con cada request. Cualquier persona con la URL pública puede usar el dashboard, pero su IndexedDB es independiente (per-origen, per-browser).
- **Mainnet**: el banner amarillo sale en el primer load y los guardrails (default model, confirmación de modelo caro, lock screen en balance 0) siguen activos.
- **CORS**: `api.llm4agents.com` y `mcp.llm4agents.com` ya devuelven `access-control-allow-origin: *`, no hace falta proxy.
- **Rate limits**: 120 req/min por API key. Si varios users comparten una key, pueden chocarse.

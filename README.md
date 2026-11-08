# Mi Agenda

Agenda personal con calendario, hábitos por días de la semana, tareas, notas diarias y métricas
(rachas, cumplimiento, tendencias). Funciona en el móvil y se puede instalar como app.

- **Frontend:** Vite + JavaScript, sin framework.
- **Base de datos e inicio de sesión:** Supabase (Postgres con Row Level Security: cada usuario solo ve lo suyo).
- **Publicación:** Vercel.

## Puesta en marcha (una sola vez)

### 1. Crear la base de datos en Supabase

1. Entra en [supabase.com](https://supabase.com) y pulsa **New project** (el plan gratuito sirve).
2. Cuando esté listo, abre **SQL Editor → New query**, pega el contenido de [`supabase/schema.sql`](supabase/schema.sql) y pulsa **Run**.
3. Ve a **Project Settings → API** y copia dos datos:
   - **Project URL**: algo como `https://abcd1234.supabase.co`.
   - **anon public key**: la clave pública (es seguro usarla en la web; la seguridad la ponen las reglas del esquema).

### 2. Publicar en Vercel

1. En [vercel.com](https://vercel.com) pulsa **Add New → Project** e importa este repositorio.
2. Vercel detecta Vite solo. Antes de pulsar **Deploy**, abre **Environment Variables** y añade:
   - `VITE_SUPABASE_URL` = tu Project URL
   - `VITE_SUPABASE_ANON_KEY` = tu anon public key
3. Pulsa **Deploy**. Te dará una dirección como `https://mi-agenda-xxxx.vercel.app`.

### 3. Decirle a Supabase cuál es tu web

En Supabase → **Authentication → URL Configuration**:

- **Site URL**: la dirección de Vercel (por ejemplo `https://mi-agenda-xxxx.vercel.app`).

Así el enlace del correo de confirmación de cuenta te lleva a tu web.

### 4. Crear tu cuenta

Abre tu web, pulsa **Crear una**, escribe tu correo y una contraseña, y confirma desde el correo que te llega.

**Recomendado:** cuando tengas tu cuenta, en Supabase → **Authentication → Sign In / Providers → Email**,
desactiva **Allow new users to sign up** para que nadie más pueda registrarse en tu web.

### 5. Instalarla en el móvil

- **iPhone (Safari):** botón Compartir → **Añadir a pantalla de inicio**.
- **Android (Chrome):** menú ⋮ → **Instalar aplicación** (o «Añadir a pantalla de inicio»).

## Desarrollo en local

```bash
cp .env.example .env   # y rellena los dos valores
npm install
npm run dev
```

## Estructura

| Archivo | Qué hace |
|---|---|
| `index.html` | Estructura de la página: inicio de sesión y las tres vistas (Agenda, Semana, Métricas) |
| `src/main.js` | Arranque e inicio de sesión |
| `src/app.js` | Toda la interfaz: calendario, hábitos, tareas, notas, semana y métricas |
| `src/store.js` | Sincronización con Supabase (envía solo los cambios) |
| `src/styles.css` | Estilos, con modo claro y oscuro |
| `supabase/schema.sql` | Tablas y reglas de seguridad |

## Tablas

| Tabla | Contenido |
|---|---|
| `habits` | Hábitos: nombre, momento del día, días de la semana en que tocan |
| `habit_logs` | Un registro por hábito y día cumplido |
| `todos` | Tareas con fecha o sin fecha, y el día en que se completaron |
| `notes` | La nota de cada día |
| `settings` | Preferencias (por ejemplo, si ya se cargó el plan semanal) |

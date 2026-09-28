# TP UTN — Registro y autenticación con Google

API con NestJS 11, TypeScript estricto, TypeORM, PostgreSQL, Passport y JWT. El registro y el login se realizan mediante Google. No requiere frontend ni implementa contraseñas locales.

## Requisitos

- Node.js 22 o 24 (verificado con 24.15.0) y npm.
- PostgreSQL local o Docker Desktop con el motor iniciado.
- Cuenta de Google Cloud para crear un cliente OAuth de tipo aplicación web.
- Navegador para OAuth y Postman, Insomnia o REST Client para probar JWT.

El enunciado permite Node 18 o superior. Este proyecto utiliza NestJS 11 y requiere una versión más nueva de Node. No hace falta instalar el CLI global: está incluido como dependencia de desarrollo.

## Clonar e instalar

Clonar el repositorio (se necesita acceso si es privado):

```powershell
git clone https://github.com/agus-testa-pruebas/nestjs-google-oauth.git
cd nestjs-google-oauth
npm ci
Copy-Item .env.example .env
```

Si abrís la copia que se preparó en esta sesión, el archivo `.env` ya existe y contiene secretos locales aleatorios: **no lo sobrescribas**. El `package-lock.json` fija las versiones instaladas; subirlo al repositorio permite reproducirlas con `npm ci`.

## Configurar .env

Editar `.env`, nunca agregar secretos al código ni al repositorio:

- `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`: conexión con PostgreSQL.
- `DB_SYNCHRONIZE=true`: TypeORM crea y ajusta la tabla en desarrollo. No usar con datos de producción; allí se requieren migraciones, fuera del alcance de este TP.
- `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`: los entrega Google Cloud.
- `GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/redirect`.
- `JWT_SECRET` y `SESSION_SECRET`: secretos diferentes, de al menos 32 caracteres. Generar cada uno ejecutando:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copiar cada resultado a su variable. Elegir también una contraseña para PostgreSQL. El proyecto rechaza valores `REEMPLAZAR...` y configuraciones incompletas al iniciar; así los errores se detectan antes de recibir solicitudes.

## Configurar Google Cloud

1. Abrir https://console.cloud.google.com/ y crear o seleccionar un proyecto propio para el TP.
2. En Google Auth Platform / pantalla de consentimiento, completar el nombre de la aplicación y el correo de soporte/contacto.
3. Elegir audiencia **External**. Si está en modo **Testing**, agregar tu cuenta de Google como usuario de prueba.
4. Crear credenciales **OAuth client ID**, tipo **Web application**.
5. Registrar el origen autorizado `http://localhost:3000`.
6. Registrar exactamente la URI de redirección `http://localhost:3000/auth/google/redirect`.
7. Copiar Client ID y Client Secret a `.env`. No compartirlos en capturas ni subir el JSON descargado al repositorio.
8. Usar permisos de email y perfil. No hace falta habilitar Gmail API: el TP no accede a correos.

Los nombres de las secciones de la consola pueden variar. Lo importante es la audiencia externa, el cliente web y la coincidencia exacta del callback.

## Iniciar PostgreSQL

Desde la carpeta que contiene `compose.yaml` y `.env`:

```powershell
docker compose up -d --wait
```

Resultado esperado: servicio `db` saludable, puerto local 5432 y datos conservados en un volumen de Docker. Si ya tenés PostgreSQL en ese puerto, configurar otro puerto libre en `DB_PORT` antes de iniciar el contenedor.

Alternativa sin Docker: crear una base PostgreSQL y un usuario con permisos sobre ella, y completar `.env` con esa conexión. La tabla `users` se crea al iniciar la API; no es necesario escribir un script SQL para el desarrollo.

## Ejecutar

```powershell
npm run start:dev
```

Resultado esperado: Nest se conecta a PostgreSQL y registra estas rutas:

- `GET /auth/google`: redirige al login de Google.
- `GET /auth/google/redirect`: recibe el callback y devuelve `{ token, user }`.
- `GET /auth/profile`: devuelve el usuario actual cuando recibe un JWT válido.

No hay endpoint `/`: que responda 404 es normal. Para iniciar sesión abrir **http://localhost:3000/auth/google** en el navegador. No abrir directamente el callback: Google debe llegar a él con su código y el `state` generado por Passport.

Para ejecutar la versión compilada:

```powershell
npm run build
npm start
```

## Probar manualmente el flujo completo

1. Abrir `/auth/google` en el navegador, elegir la cuenta de prueba y autorizar.
2. El callback devuelve JSON con un JWT y los campos del usuario, incluidos `id`, `googleId`, `createdAt` y `updatedAt`.
3. Copiar `token` a Postman: GET `http://localhost:3000/auth/profile`, Authorization → Bearer Token. Debe responder 200 con el usuario.
4. Quitar el token: debe responder 401. Reemplazarlo por un texto inválido: también 401.
5. Volver a entrar con la misma cuenta: debe conservar el `id`, sin crear otra fila.
6. Reiniciar el servidor y volver a entrar: debe conservar el usuario, demostrando persistencia.
7. Inspeccionar la tabla desde un cliente SQL. En este proyecto los nombres camelCase se escriben entre comillas en SQL:

```sql
SELECT id, email, "firstName", "lastName", picture, "googleId", "createdAt", "updatedAt"
FROM users;
```

El archivo `requests.http` permite ejecutar las solicitudes con REST Client. El login interactivo se inicia en el navegador para conservar la cookie de `state`.

## Pruebas automatizadas

```powershell
npm run build
npm run typecheck
npm test
```

Las pruebas normales no necesitan Google ni PostgreSQL: simulan el repositorio, pero ejecutan Nest, Passport y la firma/verificación de JWT. Cubren alta, login repetido, vinculación por email, conflicto de cuentas, datos incompletos, perfil sin foto, ruta privada y `state`.

Para probar persistencia **real**, iniciar PostgreSQL y ejecutar:

```powershell
npm run test:integration
```

Esta prueba usa las variables de base de datos de `.env`; no necesita credenciales Google. Crea un esquema PostgreSQL con nombre aleatorio, prueba creación, actualización, vinculación y restricciones únicas, y elimina únicamente ese esquema al finalizar. El usuario de base de datos necesita permiso para crear esquemas. No modifica la tabla `public.users`.

Ninguna prueba simulada demuestra un login real con Google: ese paso necesita completar la configuración de la consola y autorizar desde el navegador.

## Organización

```text
src/
  main.ts                  Inicio del servidor
  session.ts               Sesión temporal para state de OAuth
  app.module.ts            Módulo principal
  config/env.validation.ts Validación de configuración
  database/database.module.ts
  users/
    user.entity.ts         Tabla users
    users.module.ts        Registro de repositorio y servicio
    users.service.ts       Acceso a datos
  auth/
    auth.module.ts         Conexión de las piezas de autenticación
    auth.types.ts          Tipos de datos y solicitudes
    auth.service.ts        Buscar, vincular, crear y firmar JWT
    auth.controller.ts     Rutas HTTP
    google.strategy.ts     Perfil verificado por Google
    jwt.strategy.ts        Validación del JWT y búsqueda del usuario
test/
  auth.spec.ts             Lógica y HTTP con repositorio simulado
  users.integration.ts     Persistencia PostgreSQL real
  jest-integration.json    Configuración de integración
```

El código completo del proyecto está en src/ y las pruebas están en test/.

## Decisiones y defensa

- **ORM:** TypeORM convierte entidades en tablas y ofrece `Repository<User>`. No hace falta una clase de repositorio propia.
- **Inyección de dependencias:** Nest entrega `UsersService` y `JwtService` al constructor de `AuthService`; no usamos `new` dentro del servicio.
- **Registro e ingreso:** comparten el mismo flujo; si no existe el usuario, se crea automáticamente.
- **Vinculación:** un email verificado permite buscar una cuenta previa con `googleId=null`. Si ya tiene otro Google ID, se responde 409, sin reemplazarlo.
- **Duplicados:** normalizamos email a minúsculas; la base impone UNIQUE sobre email y googleId. Las cuentas previas también deben tener email normalizado. No hay endpoint de importación ni registro tradicional en este TP.
- **JWT:** contiene `sub` (id interno), `email`, fechas de emisión/vencimiento, emisor y audiencia. Está firmado, no cifrado: nunca poner secretos en el payload. Dura una hora.
- **Passport:** `GoogleStrategy.validate` retorna el resultado y Nest lo coloca en `req.user`; no hace falta invocar `done` manualmente.
- **Token de Google:** se recibe como parte del intercambio, pero no se persiste ni se devuelve. El token que devolvemos lo firma nuestra API.
- **Sesión temporal:** `express-session` conserva `state` para comprobar que el callback pertenece al navegador que inició el flujo. `session:false` en Passport evita sesiones de login persistentes. `/auth/profile` exige JWT, no la cookie.
- **Excepciones:** `UnauthorizedException` (401) y `ConflictException` (409) son subclases de `HttpException`. Los errores inesperados reciben el tratamiento 500 de Nest.
- **Campos opcionales de Google:** si falta nombre, apellido o foto, guardamos una cadena vacía. El email verificado y el Google ID son indispensables.
- **Desarrollo local:** la sesión usa memoria. Reiniciar el proceso durante un login obliga a iniciarlo de nuevo. Un despliegue con varias instancias necesitaría un almacén compartido, HTTPS y migraciones; no se presenta esta configuración como despliegue de producción.

## Errores habituales

- **`redirect_uri_mismatch`:** revisar la URI en Google Cloud y `GOOGLE_CALLBACK_URL`; deben coincidir protocolo, dominio, puerto y ruta.
- **`access_denied`:** agregar la cuenta como usuario de prueba o volver a iniciar el flujo si cancelaste el consentimiento.
- **401 en el callback:** no abrirlo manualmente; volver a `/auth/google` en el mismo navegador y completar el proceso antes de diez minutos.
- **401 en `/auth/profile`:** enviar `Authorization: Bearer TOKEN`, sin comillas; obtener otro token si pasó una hora.
- **Error de conexión PostgreSQL:** iniciar Docker Desktop y el servicio `db`; revisar host, puerto y credenciales.
- **Cambiar `DB_PASSWORD` después de crear el volumen:** PostgreSQL conserva la contraseña inicial; actualizarla dentro de PostgreSQL o usar las credenciales originales. Cambiar `.env` no cambia una base ya inicializada.
- **`Configurar ... en .env`:** completar la variable mencionada y reiniciar Nest. No publicar el contenido de `.env` para pedir ayuda.

## Publicar para entregar

Crear un repositorio vacío en GitHub o GitLab. Desde esta carpeta:

```powershell
git init
git add .
git status
git commit -m "Implementar autenticación Google con NestJS"
git branch -M main
git remote add origin https://github.com/agus-testa-pruebas/nestjs-google-oauth.git
git push -u origin main
```

Antes del commit, comprobar que `.env`, `node_modules` y `dist` no estén listados para agregar. `.env.example`, `package-lock.json`, código, pruebas y documentación sí se entregan. Si el repositorio es privado, dar acceso al docente. Estos comandos sirven como referencia para publicar una copia nueva; no hay que repetir la inicialización en un repositorio ya clonado.

## Fuentes oficiales

- [NestJS: Passport](https://docs.nestjs.com/recipes/passport)
- [NestJS: TypeORM](https://docs.nestjs.com/techniques/database)
- [Passport: Google OAuth2](https://www.passportjs.org/packages/passport-google-oauth20/)
- [Passport: state](https://www.passportjs.org/tutorials/google/state/)
- [Google: OAuth para aplicaciones web](https://developers.google.com/identity/protocols/oauth2/web-server)


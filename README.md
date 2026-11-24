# K-Spec Garage

Aplicación web de gestión para un taller mecánico y de preparaciones (**K-Spec Garage**). Permite a los clientes dar de alta sus vehículos, pedir cita online y ver en qué fase se encuentra su coche dentro del taller, y al jefe de taller gestionar las órdenes, presupuestos y notas técnicas desde su propio panel.

## Funcionalidades principales

- **Portada pública:** presentación del taller, servicios disponibles y acceso directo a la reserva de citas.
- **Autenticación con JWT:** registro de nuevos clientes e inicio de sesión con contraseñas cifradas (`bcryptjs`) y control de acceso por roles (`cliente` y `admin`).
- **Portal de cliente:**
  - Gestión de garaje personal (alta y borrado de vehículos con marca, modelo, año, matrícula y motor).
  - Solicitud de citas indicando vehículo, servicio, fecha y comentarios.
  - Seguimiento visual de cada orden (`Pendiente` → `En elevador` → `Esperando piezas` → `Listo para recoger`), junto con presupuesto y notas del mecánico.
- **Panel de administración (jefe de taller):**
  - Vista general con contadores de órdenes y facturación estimada.
  - Filtros por estado y buscador por matrícula, cliente o servicio.
  - Edición de estado, presupuesto y notas técnicas de cada orden, además de eliminación de registros.
  - Listado completo de vehículos registrados por todos los clientes.

## Tecnologías utilizadas

- **Backend:** Node.js 20, Express, Mongoose, JSON Web Token (`jsonwebtoken`), `bcryptjs`, `cors`, `dotenv`.
- **Base de datos:** MongoDB 7.
- **Frontend:** HTML5, CSS3 y JavaScript (SPA en vanilla JS servida directamente por Express).
- **Contenedores:** Docker y Docker Compose.

## Estructura del proyecto

```text
k-spec-garage/
├── backend/
│   ├── middleware/
│   │   └── auth.js          # Verificación de token JWT y rol admin
│   ├── models/
│   │   ├── Order.js         # Esquema de citas / órdenes de taller
│   │   ├── User.js          # Esquema de usuarios (cliente / admin)
│   │   └── Vehicle.js       # Esquema de vehículos
│   ├── routes/
│   │   ├── auth.js          # Registro, login y comprobación de sesión
│   │   ├── orders.js        # CRUD de órdenes de taller
│   │   └── vehicles.js      # CRUD de vehículos
│   ├── Dockerfile
│   ├── package.json
│   └── server.js            # Punto de entrada, seed inicial y servidor de estáticos
├── docs/
│   ├── img/                 # Capturas de pantalla de la aplicación
│   └── memoria.md           # Documentación técnica y manual de uso
├── frontend/
│   ├── css/
│   │   └── styles.css
│   ├── js/
│   │   └── app.js
│   └── index.html
└── docker-compose.yml
```

## Cómo ejecutar el proyecto

### Con Docker Compose (opción recomendada)

Solo hace falta tener Docker instalado. Desde la raíz del repositorio:

```bash
docker compose up --build
```

El backend espera a que MongoDB esté disponible, carga unos datos iniciales de prueba si la base de datos está vacía y deja la aplicación escuchando en:

- Web y API: `http://localhost:3000`
- MongoDB: `localhost:27017`

Para detener los contenedores:

```bash
docker compose down
```

### En local sin Docker

Si prefieres arrancarlo manualmente, necesitas una instancia local de MongoDB corriendo en el puerto `27017`:

```bash
cd backend
npm install
npm start
```

Opcionalmente puedes crear un archivo `backend/.env` con las variables `PORT`, `MONGO_URI` y `JWT_SECRET`.

## Usuarios de prueba

Al arrancar por primera vez se crean automáticamente dos cuentas y varios datos de ejemplo (un cliente con dos coches y una orden activa):

| Rol | Correo | Contraseña |
| :--- | :--- | :--- |
| Jefe de taller (`admin`) | `admin@kspec.es` | `admin123` |
| Cliente (`cliente`) | `cliente@kspec.es` | `cliente123` |

## Resumen de endpoints de la API

| Método | Ruta | Acceso | Descripción |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Público | Comprueba que el servidor responde |
| `POST` | `/api/auth/register` | Público | Registra un nuevo usuario con rol `cliente` |
| `POST` | `/api/auth/login` | Público | Inicia sesión y devuelve el token JWT |
| `GET` | `/api/auth/me` | Autenticado | Devuelve los datos del usuario actual |
| `GET` | `/api/vehicles` | Autenticado | Lista los vehículos del cliente (o todos si es `admin`) |
| `POST` | `/api/vehicles` | Autenticado | Registra un vehículo en el garaje del usuario |
| `DELETE` | `/api/vehicles/:id` | Autenticado | Elimina un vehículo |
| `GET` | `/api/orders` | Autenticado | Lista las órdenes del cliente (o todas si es `admin`) |
| `POST` | `/api/orders` | Autenticado | Crea una nueva cita para un vehículo del cliente |
| `PUT` | `/api/orders/:id` | Solo `admin` | Actualiza estado, presupuesto y notas del taller |
| `DELETE` | `/api/orders/:id` | Solo `admin` | Elimina una orden |

## Documentación adicional

En [docs/memoria.md](docs/memoria.md) se encuentra la memoria completa del proyecto (análisis, diseño de la base de datos, detalle de la API y manual de uso con capturas).

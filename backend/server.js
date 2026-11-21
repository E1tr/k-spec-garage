require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');

const User = require('./models/User');
const Vehicle = require('./models/Vehicle');
const Order = require('./models/Order');

const authRoutes = require('./routes/auth');
const vehicleRoutes = require('./routes/vehicles');
const orderRoutes = require('./routes/orders');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/kspec_garage';

app.use(cors());
app.use(express.json());

// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// Rutas API
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'K-Spec Garage API' });
});
app.use('/api/auth', authRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Ruta de API no encontrada.' });
});

// Datos iniciales de prueba si la BBDD está vacía
async function seedDatabase() {
    const adminExists = await User.findOne({ email: 'admin@kspec.es' });
    if (!adminExists) {
        const adminPass = await bcrypt.hash('admin123', 10);
        const clientPass = await bcrypt.hash('cliente123', 10);

        await User.create({
            nombre: 'Jefe de Taller K-Spec',
            email: 'admin@kspec.es',
            password: adminPass,
            telefono: '600000001',
            rol: 'admin'
        });

        const cliente = await User.create({
            nombre: 'Daniel García',
            email: 'cliente@kspec.es',
            password: clientPass,
            telefono: '600123456',
            rol: 'cliente'
        });

        const car1 = await Vehicle.create({
            owner_id: cliente._id,
            marca: 'Honda',
            modelo: 'Accord 2.4 Executive',
            anio: 2008,
            matricula: '4829 GHK',
            motor: 'K24A3 190CV'
        });

        await Vehicle.create({
            owner_id: cliente._id,
            marca: 'Ford',
            modelo: 'Fiesta 1.0 EcoBoost',
            anio: 2017,
            matricula: '9104 JKL',
            motor: '1.0 Turbo'
        });

        await Order.create({
            client_id: cliente._id,
            vehicle_id: car1._id,
            servicio: 'Reprogramación Stage 1 + Admisión',
            descripcion_cliente: 'Ajuste de electrónica a medida y montaje de admisión directa.',
            estado: 'En elevador',
            presupuesto: 320,
            notas_taller: 'Admisión montada. Realizando lanzadas en banco para afinar curva de par.',
            fecha_cita: '2026-11-23'
        });

        console.log('✅ Datos iniciales de K-Spec Garage creados (admin@kspec.es / cliente@kspec.es)');
    }
}

// Fallback SPA hacia index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

async function connectWithRetry(retries = 10, delayMs = 3000) {
    for (let i = 1; i <= retries; i++) {
        try {
            await mongoose.connect(MONGO_URI);
            console.log('🟢 Conectado a MongoDB correctamente');
            await seedDatabase();
            app.listen(PORT, '0.0.0.0', () => {
                console.log(`🚀 Servidor K-Spec Garage escuchando en http://localhost:${PORT}`);
            });
            return;
        } catch (err) {
            console.error(`🔴 Intento ${i}/${retries} fallido conectando a MongoDB:`, err.message);
            if (i === retries) process.exit(1);
            await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
    }
}

connectWithRetry();
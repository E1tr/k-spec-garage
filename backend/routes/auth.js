const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Registro de cliente
router.post('/register', async (req, res) => {
    try {
        const { nombre, email, password, telefono } = req.body;
        if (!nombre || !email || !password) {
            return res.status(400).json({ error: 'Nombre, correo y contraseña son obligatorios.' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
        }

        const normalizedEmail = email.trim().toLowerCase();
        const exists = await User.findOne({ email: normalizedEmail });
        if (exists) return res.status(400).json({ error: 'El correo ya está registrado.' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await User.create({
            nombre: nombre.trim(),
            email: normalizedEmail,
            password: hashedPassword,
            telefono: telefono ? telefono.trim() : '',
            rol: 'cliente'
        });

        const token = jwt.sign(
            { id: user._id, rol: user.rol, nombre: user.nombre },
            process.env.JWT_SECRET || 'kspec_super_secreto_2026',
            { expiresIn: '7d' }
        );

        res.status(201).json({
            token,
            user: { id: user._id, nombre: user.nombre, email: user.email, telefono: user.telefono, rol: user.rol }
        });
    } catch (err) {
        res.status(500).json({ error: 'Error al registrar usuario.' });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Introduce tu correo y contraseña.' });
        }

        const normalizedEmail = email.trim().toLowerCase();
        const user = await User.findOne({ email: normalizedEmail });
        if (!user) return res.status(400).json({ error: 'Credenciales incorrectas.' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ error: 'Credenciales incorrectas.' });

        const token = jwt.sign(
            { id: user._id, rol: user.rol, nombre: user.nombre },
            process.env.JWT_SECRET || 'kspec_super_secreto_2026',
            { expiresIn: '7d' }
        );

        res.json({
            token,
            user: { id: user._id, nombre: user.nombre, email: user.email, telefono: user.telefono, rol: user.rol }
        });
    } catch (err) {
        res.status(500).json({ error: 'Error en el inicio de sesión.' });
    }
});

// Obtener perfil del usuario autenticado
router.get('/me', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });
        res.json({
            user: { id: user._id, nombre: user.nombre, email: user.email, telefono: user.telefono, rol: user.rol }
        });
    } catch (err) {
        res.status(500).json({ error: 'Error al verificar la sesión.' });
    }
});

module.exports = router;

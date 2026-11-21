const express = require('express');
const Vehicle = require('../models/Vehicle');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Obtener vehículos (Cliente ve los suyos; Admin ve todos)
router.get('/', authMiddleware, async (req, res) => {
    try {
        const filter = req.user.rol === 'admin' ? {} : { owner_id: req.user.id };
        const vehicles = await Vehicle.find(filter)
            .populate('owner_id', 'nombre email telefono')
            .sort({ createdAt: -1 });
        res.json(vehicles);
    } catch (err) {
        res.status(500).json({ error: 'Error al obtener vehículos.' });
    }
});

// Registrar nuevo vehículo
router.post('/', authMiddleware, async (req, res) => {
    try {
        const { marca, modelo, anio, matricula, motor } = req.body;
        if (!marca || !modelo || !anio || !matricula) {
            return res.status(400).json({ error: 'Marca, modelo, año y matrícula son obligatorios.' });
        }

        const vehicle = await Vehicle.create({
            owner_id: req.user.id,
            marca,
            modelo,
            anio: Number(anio),
            matricula,
            motor: motor || ''
        });
        res.status(201).json(vehicle);
    } catch (err) {
        res.status(500).json({ error: 'Error al registrar el vehículo.' });
    }
});

// Eliminar vehículo
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const filter = req.user.rol === 'admin'
            ? { _id: req.params.id }
            : { _id: req.params.id, owner_id: req.user.id };
        const deleted = await Vehicle.findOneAndDelete(filter);
        if (!deleted) return res.status(404).json({ error: 'Vehículo no encontrado.' });
        res.json({ message: 'Vehículo eliminado.' });
    } catch (err) {
        res.status(500).json({ error: 'Error al eliminar el vehículo.' });
    }
});

module.exports = router;
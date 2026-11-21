const express = require('express');
const Order = require('../models/Order');
const Vehicle = require('../models/Vehicle');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

const router = express.Router();

// Obtener órdenes (Admin ve todas; Cliente solo las suyas)
router.get('/', authMiddleware, async (req, res) => {
    try {
        const filter = req.user.rol === 'admin' ? {} : { client_id: req.user.id };
        const orders = await Order.find(filter)
            .populate('client_id', 'nombre email telefono')
            .populate('vehicle_id', 'marca modelo anio matricula motor')
            .sort({ createdAt: -1 });
        res.json(orders);
    } catch (err) {
        res.status(500).json({ error: 'Error al obtener las órdenes de taller.' });
    }
});

// Crear nueva cita / orden (Cliente)
router.post('/', authMiddleware, async (req, res) => {
    try {
        const { vehicle_id, servicio, descripcion_cliente, fecha_cita } = req.body;
        if (!vehicle_id || !servicio || !fecha_cita) {
            return res.status(400).json({ error: 'Vehículo, servicio y fecha de cita son obligatorios.' });
        }

        const vehicle = await Vehicle.findOne({ _id: vehicle_id, owner_id: req.user.id });
        if (!vehicle) {
            return res.status(404).json({ error: 'Vehículo no encontrado en tu garaje.' });
        }

        const order = await Order.create({
            client_id: req.user.id,
            vehicle_id: vehicle._id,
            servicio,
            descripcion_cliente: descripcion_cliente || '',
            fecha_cita
        });
        const populated = await order.populate('vehicle_id', 'marca modelo anio matricula motor');
        res.status(201).json(populated);
    } catch (err) {
        res.status(500).json({ error: 'Error al solicitar la cita.' });
    }
});

// Actualizar estado, presupuesto y notas (Solo Admin/Taller)
router.put('/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { estado, presupuesto, notas_taller } = req.body;
        const updated = await Order.findByIdAndUpdate(
            req.params.id,
            { estado, presupuesto, notas_taller },
            { new: true, runValidators: true }
        )
            .populate('client_id', 'nombre email telefono')
            .populate('vehicle_id', 'marca modelo anio matricula motor');

        if (!updated) return res.status(404).json({ error: 'Orden no encontrada.' });
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: 'Error al actualizar la orden.' });
    }
});

// Eliminar orden (Admin)
router.delete('/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const deleted = await Order.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ error: 'Orden no encontrada.' });
        res.json({ message: 'Orden eliminada.' });
    } catch (err) {
        res.status(500).json({ error: 'Error al eliminar la orden.' });
    }
});

module.exports = router;
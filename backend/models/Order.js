const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    client_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    vehicle_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', required: true },
    servicio: { type: String, required: true },
    descripcion_cliente: { type: String, default: '' },
    estado: {
        type: String,
        enum: ['Pendiente', 'En elevador', 'Esperando piezas', 'Listo para recoger'],
        default: 'Pendiente'
    },
    presupuesto: { type: Number, default: 0 },
    notas_taller: { type: String, default: 'Pendiente de revisión inicial por el mecánico.' },
    fecha_cita: { type: String, required: true }
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);
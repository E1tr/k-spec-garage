const mongoose = require('mongoose');

const vehicleSchema = new mongoose.Schema({
    owner_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    marca: { type: String, required: true, trim: true },
    modelo: { type: String, required: true, trim: true },
    anio: { type: Number, required: true },
    matricula: { type: String, required: true, uppercase: true, trim: true },
    motor: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Vehicle', vehicleSchema);
const mongoose = require("mongoose");

const driverSchema = new mongoose.Schema({

  driverId: {
    type: String,
    unique: true
  },
  schoolId: String,
  CurentJob: {
    busNumber: String,
    busNumber: String,
    busAsignNumber:String,
    
  },
  name: String,
  phone: String,
  password: String,
}, {
  timestamps: true
});

module.exports = mongoose.model(
  "Driver",
  driverSchema
);
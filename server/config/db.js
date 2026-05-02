

const mongoose = require('mongoose')
const dns = require('dns')

dns.setDefaultResultOrder('ipv4first')

// ✅ Add this
mongoose.set('strictQuery', true)

async function connectDB() {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 45000,
      family: 4
    })

    console.log(`✅ MongoDB connected: ${conn.connection.host}`)
  } catch (err) {
    console.error('❌ MongoDB failed:', err)
    //process.exit(1)
      setTimeout(connectDB, 5000)
  }
}

module.exports = connectDB
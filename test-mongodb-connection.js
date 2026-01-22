const mongoose = require('mongoose');

const MONGO_URI = 'mongodb://admin:admin123@localhost:27017/chabaqa?authSource=admin&directConnection=true';

console.log('🔍 Testing MongoDB connection...');
console.log('URI:', MONGO_URI);
console.log('');

mongoose.connect(MONGO_URI, {
  serverSelectionTimeoutMS: 5000,
  connectTimeoutMS: 5000,
})
.then(() => {
  console.log('✅ Successfully connected to MongoDB!');
  console.log('Connection state:', mongoose.connection.readyState);
  process.exit(0);
})
.catch((error) => {
  console.error('❌ Failed to connect to MongoDB:');
  console.error('Error:', error.message);
  console.error('');
  console.error('Troubleshooting:');
  console.error('1. Check if MongoDB is running: sudo docker ps | grep mongodb');
  console.error('2. Check MongoDB logs: sudo docker logs chabaqa-mongodb --tail 50');
  console.error('3. Test from inside container: sudo docker exec chabaqa-mongodb mongosh -u admin -p admin123 --authenticationDatabase admin');
  console.error('4. Check if port 27017 is accessible: nc -zv localhost 27017');
  process.exit(1);
});

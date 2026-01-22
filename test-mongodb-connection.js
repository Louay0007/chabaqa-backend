const mongoose = require('mongoose');

console.log('🔍 Testing MongoDB connection...');
console.log('');

// Test 1: Without directConnection
const MONGO_URI_1 = 'mongodb://admin:admin123@127.0.0.1:27017/chabaqa?authSource=admin';
console.log('Test 1: Basic connection');
console.log('URI:', MONGO_URI_1);

mongoose.connect(MONGO_URI_1, {
  serverSelectionTimeoutMS: 10000,
  connectTimeoutMS: 10000,
})
.then(() => {
  console.log('✅ Successfully connected to MongoDB!');
  console.log('Connection state:', mongoose.connection.readyState);
  mongoose.connection.close();
  process.exit(0);
})
.catch((error) => {
  console.error('❌ Test 1 failed:', error.message);
  console.log('');
  
  // Test 2: With directConnection
  const MONGO_URI_2 = 'mongodb://admin:admin123@127.0.0.1:27017/chabaqa?authSource=admin&directConnection=true';
  console.log('Test 2: With directConnection=true');
  console.log('URI:', MONGO_URI_2);
  
  mongoose.connect(MONGO_URI_2, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
  })
  .then(() => {
    console.log('✅ Successfully connected to MongoDB!');
    console.log('Connection state:', mongoose.connection.readyState);
    mongoose.connection.close();
    process.exit(0);
  })
  .catch((error2) => {
    console.error('❌ Test 2 failed:', error2.message);
    console.log('');
    
    // Test 3: localhost instead of 127.0.0.1
    const MONGO_URI_3 = 'mongodb://admin:admin123@localhost:27017/chabaqa?authSource=admin';
    console.log('Test 3: Using localhost');
    console.log('URI:', MONGO_URI_3);
    
    mongoose.connect(MONGO_URI_3, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
    })
    .then(() => {
      console.log('✅ Successfully connected to MongoDB!');
      console.log('Connection state:', mongoose.connection.readyState);
      mongoose.connection.close();
      process.exit(0);
    })
    .catch((error3) => {
      console.error('❌ All tests failed!');
      console.error('');
      console.error('Last error:', error3.message);
      console.error('');
      console.error('Troubleshooting:');
      console.error('1. Check MongoDB is running: sudo docker ps | grep mongodb');
      console.error('2. Check MongoDB logs: sudo docker logs chabaqa-mongodb --tail 50');
      console.error('3. Check port: sudo ss -tlnp | grep 27017');
      console.error('4. Test from container: sudo docker exec chabaqa-mongodb mongosh -u admin -p admin123 --authenticationDatabase admin --eval "db.adminCommand(\'ping\')"');
      process.exit(1);
    });
  });
});

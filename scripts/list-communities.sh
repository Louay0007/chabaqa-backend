#!/bin/bash
node -e "
const mongoose = require('mongoose');
mongoose.connect('mongodb+srv://admin:admin@chabaqa.bmmujoq.mongodb.net/?appName=chabaqa')
  .then(async () => {
    const Community = mongoose.model('Community', new mongoose.Schema({}, {strict:false}));
    const communities = await Community.find({}).lean();
    console.log('Total communities:', communities.length);
    communities.forEach((c, i) => {
      console.log(\`\${i+1}. \${c.name || c.titre || 'No name'}\`);
      console.log(\`   ID: \${c._id}\`);
      console.log(\`   Slug: \${c.slug || 'N/A'}\`);
      console.log(\`   Active: \${c.isActive}\`);
      console.log(\`   Private: \${c.isPrivate}\`);
      console.log(\`   Members: \${c.members?.length || 0}\`);
      console.log('');
    });
    process.exit(0);
  })
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
"

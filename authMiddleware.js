const jwt = require('jsonwebtoken');
const  secretKey  = 'ed944f8398073688eee89da6081e9320c60c0f8aa6a63e04033f2b955827930ffe4914e5890614b586cbb5f119d6034999ab090ffc3102bd3091581e86f70254' // Adjust the path to your config file

exports.authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Extract the token from the Authorization header

  if (token == null) {
    console.log('No token found in Authorization header'); // Log if no token is found
  }

  jwt.verify(token, secretKey, (err, payload) => {
    console.log(payload)
    if (err) {
      console.log('JWT Verification Error:', err); // Log the error
    }
    const userId = payload.user_id; // Extract the user_id from the payload
    req.user = { id: userId }; // Set the req.user property with the user_id

    next();
  });
};

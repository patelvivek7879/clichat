const { Client } = require("pg");
const net = require("net");
// const fs = require("fs");
const pino = require("pino");
const { encrypt, decrypt } = require("./encrypt-decrypt");
const chalk = require("chalk");
const { randomUUID } = require("crypto");

// configuring logger
const logger = pino({
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
    },
  },
});

const client = new Client({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_DATABASE,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

class Response {
  constructor() {
    this.action = "";
    this.success = false;
    this.error = null;
    this.result = null;
  }
}

class DataModel {
  constructor() {
    this.users = [];
    this.userID = 0;
  }

  getUserByUsername(username) {
    var user = this.users.find(function (user) {
      return username == user.username;
    });
    return user;
  }

  getLoggedInUsers() {
    var loggedInUsers = [];
    for (var e = 0; e < this.users.length; e++) {
      if (this.users[e].loggedIn) {
        loggedInUsers.push(this.users[e].username);
      }
    }
    return loggedInUsers;
  }
}

var model = new DataModel();

async function populateDataStructure() {
  client
    .connect()
    .then(() => {
      logger.info("Connected to PostgreSQL database");
    })
    .catch((err) => {
      logger.error("Error connecting to PostgreSQL database", err);
    });

  // reading from file
  // var usersJSONString = fs.readFileSync("users.data", "utf-8");
  // var users = JSON.parse(usersJSONString).users;

  var users = [];

  client.query("SELECT * FROM users", async (err, res) => {
    if (err) {
      logger.error(err);
      return;
    } else {
      users = res.rows;
      users.forEach(function (user) {
        user.loggedIn = false;
        user.id = 0;
        model.users.push(user);
      });
    }
  });
}

function processRequest(requestObject) {
  if (requestObject.action == "login") {
    let username = requestObject.username;
    let password = requestObject.password;
    let user = model.getUserByUsername(username);
    var success = false;

    let response = new Response();

    if (user) {
      try {
        if (password == decrypt(user.password)) success = true;
        else if (username == user.username) {
          response.isUserThere = true;
        }
      } catch (error) {
        logger.error(error);
      }
    }
    response.action = requestObject.action;
    response.success = success;
    if (success) {
      response.error = "";
      model.userID++;
      requestObject.socket.userID = model.userID;
      user.id = model.userID;
      user.loggedIn = true;
      response.result = {
        username: user.username,
        id: user.id,
      };
    } else {
      response.error = "Invalid username / password";
      response.result = "";
    }
    requestObject.socket.write(JSON.stringify(response));
  } else if (requestObject.action == "logout") {
    var response = new Response();
    response.action = requestObject.action;
    requestObject.socket.write(JSON.stringify(response));
  } else if (requestObject.action == "getUsers") {
    var response = new Response();
    response.action = requestObject.action;
    response.result = model.getLoggedInUsers();
    requestObject.socket.write(JSON.stringify(response));
  } else if (requestObject.action == "register") {
    var response = new Response();
    // changed action type
    response.action = "registered";

    const { username, password } = requestObject;
    const encryptedPassword = encrypt(password);
    try {
      // check if user already registered
      const selectQueryForCheckUser = "SELECT * FROM users WHERE username=$1";
      client.query(selectQueryForCheckUser, [username], async (err, res) => {
        if (err) {
          logger.error(err);
          return;
        } else {
          var response = new Response();
          response.action = requestObject.action;
          response.result = "";
          response.error = `User with ${username} already registered. Please user different username`;
          response.action = "register";
          await requestObject.socket.write(JSON.stringify(response));
        }
      });
      return;
    } catch (error) {
      logger.error(error);
    }

    const insertionQuery =
      "INSERT INTO users (user_id, username, password) VALUES ($1, $2, $3) RETURNING *";
    const uuid = randomUUID();
    try {
      client.query(
        insertionQuery,
        [uuid, username, encryptedPassword],
        async (err, res) => {
          if (err) {
            logger.error(err);
            return;
          } else {
            response.success = true;
            const { username } = res.rows[0];
            response.result = {
              username: username,
              id: model.getLoggedInUsers().length + 1, // login id when user is logged in this id will be assigned
            };
            // response.result = model.getLoggedInUsers();
            await requestObject.socket.write(JSON.stringify(response));
            populateDataStructure(); // after registration of a new user repopulate the data structure
          }
        }
      );
    } catch (error) {
      logger.error(error);
    }
  } else {
    if (requestObject.action == "exit") {
      var response = new Response();
      response.action = requestObject.action;
      response.result = "";
      response.error = "Exiting...";
      requestObject.socket.write(JSON.stringify(response));
      requestObject.socket.end();
    } else {
      var response = new Response();
      response.action = requestObject.action;
      response.result = "";
      response.error = "Invalid action.";
      requestObject.socket.write(JSON.stringify(response));
    }
  }
}

populateDataStructure();
var server = net.createServer(function (socket) {
  socket.on("data", function (data) {
    var requestObject = JSON.parse(data);
    requestObject.socket = socket;
    try {
      processRequest(requestObject);
    } catch (error) {
      logger.error(error);
    }
  });

  socket.on("end", function () {
    logger.info("Client closed connection");
  });

  socket.on("error", function () {
    client.end();
    logger.error("Some problem at client side");
  });
});

server.listen(5500, "localhost");
console.log("Chat server is running on port 5500");

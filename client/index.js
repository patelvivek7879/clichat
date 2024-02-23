const DataModel = require('./DataModel');
const Request = require('./Request');
const chalk = require('chalk');

const warning = chalk.keyword('orange').bgKeyword('red');

const net = require("net");
const readline = require('readline');
const events = require('events');

function acceptInput(q, ioInterface){
    var promise = new Promise(function(resolve, reject){
        ioInterface.question(q, function(answer){
                resolve(answer);
            });
        });
    return promise;
}

var model = new DataModel();
var eventEmitter = new events.EventEmitter();
var client = null;

function processAction(action){
    if(action === "register") processRegisterAction();
    if(action=="login") processLoginAction();
    if(action=="logout") processLogoutAction();
    if(action=="acceptCommand") processAcceptCommandAction();
}

async function processLoginAction(){

    let ioInterface = readline.createInterface({
        "input":  process.stdin,
        "output": process.stdout
    });

    let username = await acceptInput(" Username : ", ioInterface);
    let password = await acceptInput(" Password : ", ioInterface);

    ioInterface.close();
    let request = new Request();
    request.action="login";
    request.username = username;
    request.password = password;
    client.write(JSON.stringify(request));
}

async function processRegisterAction(){
    let ioInterface = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    let username = await acceptInput(" Username : ", ioInterface);
    let password = await acceptInput(" Password : ", ioInterface);
    let repassword = await acceptInput(" Re Password : ", ioInterface);

    ioInterface.close();

    if (password === repassword) {
      let request = new Request();
      request.action = "register";
      request.username = username;
      request.password = password;
      client.write(JSON.stringify(request));
    }else{
        console.error("Password does not match");
        processAction("register");
    }
}

function processLoginActionResponse(response){
    if(response.success == false){
        console.error(chalk.red(response.error)); // logging message Invalid username or password
        if(response.isUserThere){
            processAction("login");
        }else{
            console.log(warning("################################"));
            console.log(chalk.red.bgWhiteBright("You are not registered. Please register yourself first."));
            console.log(warning("################################"));
            processAction("register");
        }
    }else{
        model.user = response.result;
        eventEmitter.emit('loggedIn');
    }
}

function processLogoutAction(){
    console.info("Logout action ")
}
function processLogoutActionResponse(response){
    console.info("logging out...");
    processAction("login");
}

async function processAcceptCommandAction(){
    let ioInterface = readline.createInterface({
        "input": process.stdin,
        "output": process.stdout,
    })
let command = await acceptInput(`${model.user.username}(${model.user.id})>`, ioInterface);
ioInterface.close();
let request  = new Request();
request.action = command;
client.write(JSON.stringify(request));
}

function processAcceptCommandActionResponse(response){
    if(response.action == "getUsers"){
        eventEmitter.emit("usersListArrived", response.result);
    }else if(response.action=="logout"){
        eventEmitter.emit("loggedOut");
    }else {
        eventEmitter.emit("error", response.error);
    }
}

function loggedIn(){
    console.info(`Welcome ${model.user.username}\n`);
    processAction("acceptCommand");
}

function usersListArrived(users){
    console.info("List of online users");
    for(var e=0;e<users.length;e++){
        console.log(users[e]);
    }
    processAction("acceptCommand");
}

function loggedOut(){
    console.log("logout processing ...")
}

function printActionableCommands() {
    console.warn("Valid Commands");
    console.log("login");
    console.log("logout");
    console.log("getUsers");
}

function handleError(error){
        console.error(error);
        printActionableCommands()
        processAcceptCommandAction();
}

eventEmitter.on('loggedIn', loggedIn);
eventEmitter.on("usersListArrived", usersListArrived);
eventEmitter.on("loggedOut", loggedOut)
eventEmitter.on("error", handleError)

client = new net.Socket();
client.connect(5500, "localhost", function(err){
    if(err) console.error(err);
    else {
        console.log("Connected to chat server ...");
        processAction('login');
    }
});

client.on('data', function(data){
    var response = JSON.parse(data);
    if(response.action == 'login') processLoginActionResponse(response);
    else if(response.action=="logout") processLogoutActionResponse(response);
    else if(response.action=="getUsers") processAcceptCommandActionResponse(response);
    else if(response.action=="registered") {
        console.log(chalk.green("Hoorey !!! User created successfully !!!"));
        processAction("login")
        // processLoginActionResponse(response); // enable if after register want user to login directly
    }else if(response.action=="register") {
        console.log(chalk.red(response.error));
        processAction("register");
    }
    else{
        processAcceptCommandActionResponse(response)
    }
})

// runs when the server connection closed occurred
client.on('end', function(){
    console.log("Connection closed ...")
    process.exit(0);
})

// runs when the server error occurred
client.on('error', function(error){
    console.error(error);
})
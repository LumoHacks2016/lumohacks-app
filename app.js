var express = require('express'),
app = express(),
server = require('http').createServer(app),
io = require('socket.io').listen(server),
mongoose = require('mongoose'),
users = {},
users_available = [],
users_unavailable = [],
request = require('request'),
cheerio = require('cheerio'),
fs = require('fs');

app.use("/public", express.static(__dirname + '/public'));
var NUM_TAGS_FOR_MATCH = 1;

server.listen(3000); // listens to port 3000

mongoose.connect('mongodb://localhost/chat', function (err) {
    if (err) {
        console.log(err);
    } else {
        console.log('Connected to MongoDB!');
    }
}); //db is created

var chatSchema = mongoose.Schema({
    speaker: String,
    receiver: String,
    msg: String,
    created: {type: Date, default: Date.now()}
}); // can use javascript objects, eg. name: {first: String, last: String}
var Chat = mongoose.model('Message', chatSchema);
var userCredentialSchema = mongoose.Schema({
    name: String,
    password: String,
    description: {type: String, default: ""},
    tags: {type: [Boolean], default: []},
    created: {type: Date, default: Date.now()}
});
var Credentials = mongoose.model('User', userCredentialSchema);

/*
socket...
        this.name = name;
        this.password = password;
        this.available = true;
        this.socket = socket;
        this.tags = [];
        this.description = "";
        */


        app.get('/', function (req, res) {
            res.sendFile(__dirname + '/index.html');
        });

        io.sockets.on('connection', function (socket) {

            socket.on('new user', function (data, callback) {
                callback(handleUserLogin(socket, data), data.name);
            });

function handleUserLogin(socket, data){
        var success = true;
         console.log("Creating a new user");
                if (users[data] != null) {
                    success = false;
                } else {
                    socket.name = data.name;
                    console.log("Set user name to " + data.name);
                    socket.password = data.password;
                    socket.available = true;
                    if(data.tags != null)
                        socket.tags = data.tags;
                    else
                        socket.tags = [];
                    if(data.description != null)
                        socket.description = data.description;
                    else
                        socket.description = "";
                    users[data.name] = socket;
                    users_available.push(socket);
                    io.sockets.emit('alert', socket.name + " has entered the chat room.");
                    tryConnecting(socket);
                }

                var query = Chat.find({speaker: socket.name});
                query.sort('-created').exec(function (err, docs) {
                    if (err) throw err;
                    socket.emit('load old msgs', docs);
                });
                return success;
}

function usersAreMatch(user1, user2){
    var flagsFound = 0;
    for(var i = 0; i<user1.tags.length; i++){
        for(var j = 0; j<user2.tags.length; j++){
            if(user1.tags[i] === user2.tags[j]){
                flagsFound++;
                if(flagsFound > NUM_TAGS_FOR_MATCH){
                    return true;
                }
            }
        }
    }
    return false;
}

function tryConnecting(socket){
   for(var i = 0; i<users_available.length; i++){
    if(!(users_available[i].name === socket.name)){
        var currentUser = users_available[i];
        /*if(socket.available &&  currentUser.available){
        socket.available = false;
        currentUser.available = false;
        socket.emit('connect request', {name: currentUser.name, tags: currentUser.tags,
            description: currentUser.description});
        currentUser.emit('connect request', {name: socket.name, tags: socket.tags,
            description: socket.description});
}*/

connect(socket, currentUser);
}
}
}

function connect(user1, user2){
   user2.partner = user1.name;
   user1.partner = user2.name;
   user1.emit('connected', user2.name);
   user2.emit('connected', user1.name);
   console.log("connected " + user2.name + " with " + user1.name);
   movePair(user1, user2, users_available, users_unavailable);
   console.log("available: " + users_available.length + " | unavailable: " + users_unavailable.length);
}

function movePair(elem1, elem2, arr1, arr2){
    arr2.push(elem1);
    arr2.push(elem2);
    removeIf(arr1, function (elem) { return (elem === elem1) || (elem == elem2); })
}

function moveOne(elem, arr1, arr2){
    arr2.push(elem);
    removeIf(arr1, function (elem1) { return elem === elem1; })
}

function removeIf(arr, predicate) {
    for (var i = 0; i < arr.length; i++) {
        if (predicate(arr[i])) {
            arr.splice(i--, 1);
        }
    }
}

function deleteUserFromQueue(user){
    if(user == null) return;
    var queue = (user.available)? users_available : users_unavailable;
    removeIf(queue, function(elem){return user==elem});
}

socket.on('send message', function (data, callback) {
    str = data.trim();
    if(socket.partner == null || socket.available){
        socket.emit('alert', "No partner to chat with.");
        return;
    }
    var newMsg = new Chat({msg: str, speaker: socket.name, receiver: socket.partner});
    newMsg.save(function (err) {
        if (err) throw err;
        users[socket.partner].emit('new message', {msg: data, speaker: socket.name, created: Date.now()});
        socket.emit('new message', {msg: data, speaker: socket.name, created: Date.now()});
    });
});

socket.on('disconnect', function (data) {
    if (!socket.name) return;
    io.sockets.emit('alert', socket.name + " has quit the chat room.");
    if(!socket.available){
        moveOne(users[socket.partner], users_unavailable, users_available);
    }
    deleteUserFromQueue(users[socket.name]);
    delete users[socket.name];
});

socket.on('get socket state', function (data) {
    console.log("state of : " + socket.name);
   socket.emit('receive socket state', {name: socket.name, description: socket.description, tags: socket.tags});
});

socket.on('change name', function(data, callback){
    if(typeof data !== 'string' || data.length <= 0){
        callback(false);
    } else {
        callback(true);
        socket.name = data;
    }
    // socket.emit('receive socket state', {name: socket.name, description: socket.description, tags: socket.tags});
});

socket.on('change tags', function(data, callback){
  if(typeof data !== 'object'){
    callback(false);
} else {
    callback(true);
    socket.tags = data;
}
    // socket.emit('receive socket state', {name: socket.name, description: socket.description, tags: socket.tags});
});

socket.on('change description', function(data, callback){
    if(typeof data !== 'string'){
        callback(false);
    } else {
        callback(true);
        socket.description = data;
    }
   //  socket.emit('receive socket state', {name: socket.name, description: socket.description, tags: socket.tags});
});

socket.on('attempt login', function(data, callback){
    var query = Credentials.find({name: data.name}, function(err,results) {
        if(err){ // do something with error          
        }
        if(!results.length){
            // console.log("Error, that account name doesn't exist.");
            // callback(false);
            callback(false, "Error, that account name doesn't exist.");
        } else {
            if(results[0].password === data.password){
                // callback(true);
                callback(true,"");
                //socket.emit('new user', {name: data.name, password: data.password});
                handleUserLogin(socket, data);
            } else {
                // console.log("Error, the password is wrong.");
                // callback(false);
                callback(false, "Error, the password is wrong.");
            }
        }
    });
});

socket.on('attempt register', function(data, callback){
    var query = Credentials.find({name: data.name}, function(err,results) {
        if(err){            
        }
        if(!results.length){
            // callback(true);
            callback(true, "");
            var newUser = new Credentials({name: data.name, password: data.password});
            newUser.save(function (err) {
                if (err) throw err;
                console.log("Saved user " + data.name + " to the db.");
            });
            //socket.emit('new user', {name: data.name, password: data.password});
            handleUserLogin(socket, data);
        } else {
            // console.log("Error, the account name already exists.");
            // callback(false);
            callback(false, "Error, the account name already exists.");
        }
    });
});
});

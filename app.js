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

            updateNames();

            socket.on('new user', function (data, callback) {
                if (users[data] != null) {
                    callback(false, "");
                } else {
                    callback(true, data.name);
                    socket.name = data.name;
                    socket.password = data.password;
                    socket.available = true;
                    socket.tags = data.tags;
                    socket.description = data.description;
                    users[data.name] = socket;
                    users_available.push(socket);
                    updateNames();
                    io.sockets.emit('alert', socket.name + " has entered the chat room.");
                    tryConnecting(socket);
                }

                var query = Chat.find({speaker: socket.name});
                query.sort('-created').exec(function (err, docs) {
                    if (err) throw err;
                    socket.emit('load old msgs', docs);
                });
            });

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
    var queue = (user.available)? users_available : users_unavailable;
    removeIf(queue, function(elem){return user==elem});
}

function updateNames() {
    io.sockets.emit('usernames', Object.keys(users));
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
    updateNames();
});
});

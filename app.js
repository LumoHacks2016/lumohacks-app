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

app.get('/', function (req, res) {
    res.sendFile(__dirname + '/index.html');
});

io.sockets.on('connection', function (socket) {

    updateNicknames();

    socket.on('new user', function (data, callback) {
        if (users[data] != null) {
            callback(false, "");
        } else {
            callback(true, data);
            socket.nickname = data;
            socket.available = true;
            users[data] = socket;
            users_available.push(socket);
            updateNicknames();
            io.sockets.emit('alert', socket.nickname + " has entered the chat room.");
            tryConnecting(socket);
        }

        var query = Chat.find({speaker: socket.nickname});
         query.sort('-created').exec(function (err, docs) {
        if (err) throw err;
        socket.emit('load old msgs', docs);
         });
    });

    function tryConnecting(socket){
     for(var i = 0; i<users_available.length; i++){
        if(!(users_available[i].nickname === socket.nickname)){
            users_available[i].partner = socket.nickname;
            socket.partner = users_available[i].nickname;
            socket.available = false;
            users_available[i].available = false;
            console.log("Connected " + users_available[i].nickname + " with " + socket.nickname);
            movePair(socket, users_available[i], users_available, users_unavailable);
            console.log("available: " + users_available.length + " | unavailable: " + users_unavailable.length);
        }
    }
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

function updateNicknames() {
    io.sockets.emit('usernames', Object.keys(users));
}

socket.on('send message', function (data, callback) {
    str = data.trim();
    if(socket.partner == null){
        socket.emit('alert', "No partner to chat with.");
        return;
    }
    var newMsg = new Chat({msg: str, speaker: socket.nickname, receiver: socket.partner});
    newMsg.save(function (err) {
        if (err) throw err;
        users[socket.partner].emit('new message', {msg: data, speaker: socket.nickname, created: Date.now()});
        socket.emit('new message', {msg: data, speaker: socket.nickname, created: Date.now()});
    });
});

socket.on('disconnect', function (data) {
    if (!socket.nickname) return;
    io.sockets.emit('alert', socket.nickname + " has quit the chat room.");
    if(!socket.available){
        moveOne(users[socket.partner], users_unavailable, users_available);
    }
    deleteUserFromQueue(users[socket.nickname]);
    delete users[socket.nickname];
    updateNicknames();
});
});

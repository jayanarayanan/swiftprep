var socket = io.connect('https://www.swiftprep.in');

var video = document.getElementById('video1');

video.addEventListener('play', function() {
    socket.emit('play', currentUser);
});

video.addEventListener('pause', function() {
    socket.emit('pause', currentUser);
});

socket.on('play', function(devices) {
    if(devices>1){
        console.log("more than 1 device is being used.")
    } else {
        continue;
    }
});

socket.on('pause', function(devices) {
    if(devices>0){
        console.log("more than 1 device is being used.")
    } else {
        continue;
    }
})
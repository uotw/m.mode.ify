function getMousePos(canvas, evt) {
  var rect = canvas.getBoundingClientRect();
  return {
	x: (evt.clientX - rect.left) / (rect.right - rect.left) * canvas.width,
        y: (evt.clientY - rect.top) / (rect.bottom - rect.top) * canvas.height
  };
}
var canvas = document.getElementById('myCanvas');
var context = canvas.getContext('2d');

context.font = "30px Arial";
context.textAlign = "center";
//context.fillText("hightlight the PHI and click", canvas.width / 2, canvas.height / 2);
crop = 50;
window.draw = true;
context.fillRect(0, 0, crop, 0);
canvas.addEventListener('mousemove', function(evt) {
  var mousePos = getMousePos(canvas, evt);
  var message = 'Mouse position: ' + mousePos.x + ',' + mousePos.y;
  //writeMessage(canvas, message);
  if (window.draw) {
    shade(evt);
  }

}, false);
canvas.addEventListener('mousedown', function(evt) {
  if (window.draw) {
    var mousePos = getMousePos(canvas, evt);
    window.croppixelperc=mousePos.y/canvas.height;

    console.log(croppixelperc);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "rgba(135,206,250, 0.5)";
    context.fillRect(0, 0, canvas.width, mousePos.y);
    context.fillStyle = "rgba(135,206,250, 0.5)";
    context.font = "30px Arial";
    context.textAlign = "center";
    context.fillStyle = "rgba(135,206,250, 0.75)";
    clickedPosY=mousePos.y;
    text = "you clicked y = " + clickedPosY;
    //context.fillText(text, canvas.width / 2, canvas.height / 2);
    window.draw = false;
  } else {
    window.draw = true;
    shade(evt);
  }
}, false);

function shade(evt) {
  var mousePos = getMousePos(canvas, evt);
  var message = 'Mouse position: ' + mousePos.x + ',' +
    mousePos.y;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(135,206,250, 0.5)";
  context.fillRect(0, 0, canvas.width, mousePos.y);
  context.strokeStyle = "rgba(135,206,250, 1)";
  context.lineWidth = 2;
  context.strokeRect(0, 0, canvas.width, mousePos.y);
  context.fillStyle = "rgba(135,206,250, 0.5)";
  //context.fillText("hightlight the PHI and click", canvas.width / 2, canvas.height / 2);
}

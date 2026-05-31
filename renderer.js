// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// All of the Node.js APIs are available in this process.
const {webUtils} = require('electron'); // webUtils for dropped-file paths (File.path was removed in Electron)
var remote = require('@electron/remote');            // built-in `remote` removed in Electron 14
var dialog = remote.dialog;
var $ = require('jquery');                            // lowercase (case-sensitive on Win/Linux)
// Remove the in-window splash overlay once its zoom/fade animation finishes.
$(function () { setTimeout(function () { var s = document.getElementById('splash'); if (s && s.parentNode) { s.parentNode.removeChild(s); } }, 1550); });
var path = require('path');
const os = require('os');                             // os-tmpdir replaced by built-in os
var ostemp = os.tmpdir();
const {shell} = require('electron');
var mmmagick = require('./mmode-magick');   // cross-platform ImageMagick (WASM) — replaces the bundled `magick` binary + .sh scripts
var mmffmpeg = require('./mmode-ffmpeg');    // one-pass native M-mode strip builder (rotate→crop→tile)
var USE_FFMPEG = true;                       // false → fall back to the per-frame magick pipeline
var LIVE_PREVIEW = true;                     // live M-mode preview while dragging the line
var PREVIEW_H = 360;                         // preview frames downscaled to this height (display is smaller)
var framesReady = false;                     // preview frames extracted for the current clip
var previewBusy = false, previewPending = null;
var previewW = 0, previewH = 0;              // downscaled preview-frame dimensions
var genBarActive = false;                    // loading bar shown during m-mode generation (reselect flow)
// Cross-platform ffmpeg/ffprobe from ffmpeg-static + ffprobe-static (macOS
// arm64/x64 + Windows x64), resolved in ./ffmpeg-paths.js. The spawn() calls
// below are unchanged — they just use these resolved paths.
var ffmpegPaths = require('./ffmpeg-paths');
var ffmpegpath = ffmpegPaths.ffmpegPath;
var ffprobepath = ffmpegPaths.ffprobePath;
var filelist = [];
var widtharr = [];
var heightarr = [];
var croppixelarr = [];
var canvasaspect;
var workdir = ostemp + '/' + maketemp();
remote.getGlobal('workdirObj').prop1=workdir;
console.log('tempdir: ' + remote.getGlobal('workdirObj').prop1);
var previewfile = workdir + '/preview.png';
var previewindex = 0;
var lastperc = 0;
var lastpercUL = 0;
var fs = require('fs');
//var path = require('path');
var croppedfilelist=[];
var title,folder,finallink;
var ispreviewclip=1;
window.croppixelperc = 0.09;
const spawn = require('child_process').spawn;
const spawnsync = require('child_process').spawnSync;

function maketemp() {
	var text = "";
	var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	for (var i = 0; i < 10; i++) text += possible.charAt(Math.floor(Math.random() * possible.length));
	return text;
}

function isclip(filename) {
	var clipext = ['mp4', 'm4v', 'avi', 'wmv', 'mov', 'flv', 'mpg', 'mpeg'];
	for (var i = 0; i < clipext.length; i++) {
		if (filename.toLowerCase().split('.').pop().indexOf(clipext[i]) >= 0) {
			return (1);
		}
	}
	return (0);
}

function search(startPath) {
	var list = [];
	if (!fs.existsSync(startPath)) {
		return;
	}
	var files = fs.readdirSync(startPath);
	for (var i = 0; i < files.length; i++) {
		var filename = path.join(startPath, files[i]);
		var stat = fs.lstatSync(filename);
		if (stat.isDirectory()) {
			var list_temp = [];
			list_temp = search(filename); //recurse
			for (var m = 0; m < list_temp.length; m++) {
				list.push(list_temp[m]);
			}
		} else if (isclip(filename)>0) {
			list.push(filename);
		}
	}
	return (list);
}
//allow drop on dahsed area
$("#filelistwrap").on('dragenter', function(event) {
	event.stopPropagation();
	event.preventDefault();
});
$("#filelistwrap").on('dragover', function(event) {
	event.stopPropagation();
	event.preventDefault();
});
// Accept a dropped clip ANYWHERE in the app (bound to the document below).
function handleFileDrop(event) {
	event.preventDefault();
	event.stopPropagation();
	var dt = (event.originalEvent || event).dataTransfer;
	if (!dt || !dt.files || !dt.files.length) { return; }
	filelist=[];
	framesReady = false;            // new clip → re-extract preview frames
	$('#mmodepreview').hide();
	var files = dt.files;
	remote.getCurrentWindow().focus();   // replaces the macOS-only `appswitch` binary
	for (var i = 0; i < files.length; i++) {
		var name = files[i].name;
		var pathn = webUtils.getPathForFile(files[i]);   // File.path was removed in Electron 32+
		if (fs.lstatSync(pathn).isDirectory()) {
			var temp_list = [];
			temp_list = search(pathn);
			for (var k = 0; k < temp_list.length; k++) {
				if (filelist.indexOf(temp_list[k]) == -1) {
					filelist.push(temp_list[k]);
					index = filelist.length;
				}
			}
		} else if (isclip(name)>0) {
			if (filelist.indexOf(pathn) == -1) {
				filelist.push(pathn);
				index = filelist.length;
			}
		}
	}
	if(filelist.length=='0'){
		$('#drag').html('ugh, no clip found, try again');
	} else {
		// Reset any current view so a drop works from anywhere (incl. mid-flow).
		calibrated = 0; lastCal = null; postershown = 0;
		$('#mmode,#mmodewrap,#mmodemsg,#poster,#calibratewrap,#calibratemsg,#selectline,#selectlinewrap').hide();
		$('#save,#recalibrate,#reselectline,#calibrateok,#selectlineok').hide();
		$('#sidebar').show();
		$('#drag').css('visibility','hidden');
		$("#filelistwrap").hide();
		$('#maintitle').hide();
		$('#loading-container').show();
		// Warm up the magick-wasm worker so its one-time WASM init overlaps the
		// ffmpeg transcode.
		mmmagick.warmup().catch(function(){});
		preview();
	}
}
$('#clearbtn').click(function() {
	filelist = [];
	$('#filelist').html('');
	$('#previewbtn').fadeOut();
	$(this).hide();
	$('#drag').css('visibility','visible');
});
//prevent ‘drop’ event on document.
$(document).on('dragenter', function(e) {
	e.stopPropagation();
	e.preventDefault();
});
$(document).on('dragover', function(e) {
	e.stopPropagation();
	e.preventDefault();
});
$(document).on('drop', handleFileDrop);   // drop a clip anywhere in the app
function queue(tasks) {
	let index = 0;
	const runTask = (arg) => {
		if (index >= tasks.length) {
			return Promise.resolve(arg);
		}
		return new Promise((resolve, reject) => {
			tasks[index++](arg).then(arg => resolve(runTask(arg))).catch(reject);
		});
	}
	return runTask();
}

function customSpawn(command, args) {
	return () => new Promise((resolve, reject) => {
		const child = spawn(command, args, {windowsVerbatimArguments: true});
		child.on('close', code => {
			if (code === 0) {
				resolve();
			} else {
				reject();
			}
		});
	});
}
var slicetotal, postershown;
function progress(i) {
	//console.log("progress: "+i+"tasks:"+taskcount);
	return () => new Promise((resolve, reject) => {
		if(!postershown && calibrated){
			postershown=1;
			$('#poster').html('<img draggable="false" src="'+workdir+'/poster.png"></img>');
                	$('#poster').fadeIn();
			$('#restart').show();
			$('#recalibrate').show();
		}
		var mmodeslice = workdir+'/stills.'+String("00000" + i).slice(-5)+'.png';
		//var slicename=+String("00000" + i).slice(-5)+'.png';
		$('#slices').append('<li><img src="'+mmodeslice+'" id="slice'+i+'" class=mmodeslice></img></li>');
		//console.log('adding slice: '+slicename);
		slicetotal=3*i;
		stop = Math.round(100 * (i + 1) / stillcount);
		var elem = document.getElementById("myBar");
		start = lastperc; 
		var width = start;
		//$('#myBar').animate({width:stop+'%'});
		var id = setInterval(frame, 30);
		//console.log(i+','+stillcount);
		window.t1 = performance.now();
		//var left=(window.t1-window.t0)*stillcount/(i*1000);
		var duration = (window.t1-window.t0)/1000;
		var left=Math.round(duration*stillcount/i-duration);
		if(left>59){
			var secs=left % 60;
			var min=Math.floor(left/60);
			var lefttext=min+' min '+secs+' sec left';
		} else {
			var lefttext=left+' secs left';
		}
		if(left>0 && calibrated>0){
			$('#timeleft').text(lefttext);
		} else {
			//$('#timeleft').hide();
		}
		//console.log("duration:"+ duration);
		//console.log("left: "+left);
		function frame() {
			if (width >= stop) {
				clearInterval(id);
				resolve(i);
				if (i == stillcount) {
                        		elem.style.width = "100%";
                        		$('#myBar').css('width', '100%');
                        		document.getElementById("label").innerHTML = "100%";
                        		//$('#progressmsg').hide();
                        		//$('#myProgress').hide();
					lastperc=0;
                		}
			} else {
				width=width+1;
				elem.style.width = width + '%';
				document.getElementById("label").innerHTML = width * 1 + '%';
			}
		}
		lastperc = stop;
	});
}
$('#finallink').click(function(){
	var ssolink=finallink;
	//var ssolink = 'https://ultrasoundjelly.auth0.com/authorize?response_type=code&client_id=Ei2ZzdG8T1pSHElwiIsZgTS6zY0vemv6&redirect_uri=' + encodeURIComponent(finallink);

//https://www.sonoclipshare.com/myarchives.php&showSignup=false';
	shell.openExternal(ssolink);
});

function setupselect(){
	return () => new Promise((resolve, reject) => {
		var outfile=workdir + '/temp.mp4';
		var ffprobe = spawnsync(ffprobepath, ['-print_format', 'json', '-show_streams', '-i', outfile]);
        	var ffprobeOb = JSON.parse(ffprobe.stdout);
		window.width = ffprobeOb.streams[0].width;
                        window.height = ffprobeOb.streams[0].height;
                        console.log('duration: '+ffprobeOb.streams[0].duration+' frames: '+ ffprobeOb.streams[0].nb_frames);
                        stillcount=ffprobeOb.streams[0].nb_frames;
			mmodewidth=stillcount*3; 
                        $('#mmode').css('width', mmodewidth+'px');
                        pps=3*stillcount/ffprobeOb.streams[0].duration;
                        $('#selectlinewrap').css('height', window.height+'px');
                        $('#selectlinewrap').css('width', window.width+'px');
                        $('#selectlinecanvas').attr('height', window.height);
                        $('#selectlinecanvas').attr('width', window.width);
                        $('#calibratewrap').css('height', window.height+'px');
                        $('#calibratewrap').css('width', window.width+'px');
                        $('#calibratecanvas').attr('height', window.height);
                        $('#calibratecanvas').attr('width', window.width);
/*
		var videodims=spawn(ffprobepath, ['-print_format', 'json', '-show_streams', '-i', outfile]);
		videodims.stderr.on('data', (data) => {
  			console.log(`stderr: ${data}`);
		});
                videodims.stdout.on('data', (data) => {
                        //console.log(data.toString());
			ffprobeOb = JSON.parse(data);
			window.width = ffprobeOb.streams[0].width;
			window.height = ffprobeOb.streams[0].height;
			console.log('duration: '+ffprobeOb.streams[0].duration+' frames: '+ ffprobeOb.streams[0].nb_frames);
			stillcount=ffprobeOb.streams[0].nb_frames;
			pps=3*stillcount/ffprobeOb.streams[0].duration;
			$('#selectlinewrap').css('height', window.height+'px');
			$('#selectlinewrap').css('width', window.width+'px');
			$('#selectlinecanvas').attr('height', window.height);
			$('#selectlinecanvas').attr('width', window.width);
			$('#calibratewrap').css('height', window.height+'px');
			$('#calibratewrap').css('width', window.width+'px');
			$('#calibratecanvas').attr('height', window.height);
			$('#calibratecanvas').attr('width', window.width);
                 });
*/
	resolve(1);
        });

}
var fileonly;
// Small Fluent-style preview progress bar. Always shown, eases to 90% over ~1s,
// then completes to 100% — so it never flashes and feels deliberate even when
// the transcode is near-instant.
var previewBarStart = 0;
function startPreviewBar() {
	previewBarStart = new Date().getTime();
	var fill = $('#previewbarfill');
	fill.css({ transition: 'none', width: '0%' });
	if (fill[0]) { void fill[0].offsetWidth; }   // force reflow so the next change animates
	fill.css({ transition: 'width 1s cubic-bezier(0.22, 1, 0.36, 1)', width: '90%' });
}
function finishPreviewBar(done) {
	var wait = Math.max(0, 1000 - (new Date().getTime() - previewBarStart));   // min ~1s on screen
	setTimeout(function () {
		$('#previewbarfill').css({ transition: 'width 0.25s ease', width: '100%' });
		setTimeout(function () { if (done) { done(); } }, 260);
	}, wait);
}
function preview() {
	fileonly=path.basename(filelist[0], path.extname(filelist[0]));
	console.log(fileonly);
	$('#loading-text').text('Generating Preview');
	$('#loading-container').show();
	startPreviewBar();
	$('button').hide();
	if (!fs.existsSync(workdir)) {
		fs.mkdirSync(workdir);
	}
	//console.log('trying preview');
	var myqueue = [];
	//var vftext = ' "setsar=1,scale=trunc(iw/2)*2:trunc(ih/2)*2,scale=800:-1" ';
	var vftext ='scale=iw*min(1\\,min(800/iw\\,600/ih)):-1,setsar=1,scale=trunc(in_w/2)*2:trunc(in_h/2)*2';
        var outfile = workdir + '/temp.mp4';
	//console.log(ffmpegpath+' -i '+filelist[0]+' -an -y -vf '+vftext+' '+outfile);
	// -preset ultrafast makes the preview transcode much faster (libx264 defaults
	// to the slow "medium" preset); -crf 18 keeps quality high since the stills /
	// m-mode are extracted from this file. Temp file is larger but disposable.
	myqueue.push(customSpawn(ffmpegpath, ['-i', filelist[0], '-an', '-y', '-vf', vftext,
		'-preset', 'ultrafast', '-crf', '18', '-pix_fmt', 'yuv420p', outfile]));
	myqueue.push(setupselect());
/*
	ffprobe = spawnsync(ffprobepath, ['-print_format', 'json', '-show_streams', '-i', outfile]);
	ffprobeOb = JSON.parse(ffprobe.stdout);
	window.width = ffprobeOb.streams[0].width;
	window.height = ffprobeOb.streams[0].height;
	//console.log('duration: '+ffprobeOb.streams[0].duration+' frames: '+ ffprobeOb.streams[0].nb_frames);
	stillcount=ffprobeOb.streams[0].nb_frames;
	pps=3*stillcount/ffprobeOb.streams[0].duration;
	$('#selectlinewrap').css('height', window.height+'px');
	$('#selectlinewrap').css('width', window.width+'px');
	$('#selectlinecanvas').attr('height', window.height);
	$('#selectlinecanvas').attr('width', window.width);
	$('#calibratewrap').css('height', window.height+'px');
        $('#calibratewrap').css('width', window.width+'px');
        $('#calibratecanvas').attr('height', window.height);
        $('#calibratecanvas').attr('width', window.width);
*/
/*
	var vftext = ' setsar=1,scale=trunc(iw/2)*2:trunc(ih/2)*2,scale=800:-1 ';
	var outfile = workdir + '/temp.mp4';
	myqueue.push(customSpawn(ffmpegpath, ['-i', filelist[0], '-an', '-y', '-vf', vftext, outfile]));
*/	
	//console.log(ffmpegpath+'-i'+filelist[0]+ '-an'+ '-vf'+ vftext+ outfile);
	myqueue.push(previewdump(1));
	queue(myqueue).then(([cmd, args]) => {
		console.log(cmd + ' finished - all finished');
	}).catch(TypeError, function(e) {}).catch(err => console.log(err));
}

function previewdump(i) {
	return () => new Promise((resolve, reject) => {
		var seconds = new Date().getTime() / 1000;
		var cliphtml = '<video class=added loop autoplay height='+window.height+' width='+window.width+'><source src="'+workdir + '/temp.mp4?v'+seconds+'" type=video/mp4></video>';
		$('#selectline').append(cliphtml);
		// Let the progress bar finish (min ~1s) before revealing the line picker.
		finishPreviewBar(function () {
			$('#loading-container').hide();
			$('#selectlinemsg').show();
			$('#selectline').show();
			$('#selectlinewrap').show();   // the drop reset hides this — re-show so the canvas is clickable
			$('#selectline').fadeIn(250);
			$('#restart').show();
			$('#selectlineok').show();
			extractFramesForPreview();   // ready the frames for the live preview
			selectline();
			resolve(i);
		});
	});
}
$('#home').click(function() {
	$('#activefile').hide();
	$('#activefileUL').hide();
	$('#addornew').fadeIn();
	$('#addselect').hide();
	$('#canvaswrap').hide();
	$('#clearbtn').hide();
	$('#confirm').hide();
	$('#filelistwrap').hide();
	$('#finallinkwrap').hide();
	$('#highlight').hide();
	$('#loading-container').hide();
	$('#myProgress').hide();
	$('#myProgressUL').hide();
	$('#newtitle').hide();
	$('#preview').hide();
	$('#previewbtn').hide();
	$('#progressmsg').hide();
	$('#progressmsgUL').hide();
	filelist = [];
        $('#filelist').html('');
        $('#drag').css('visibility','visible');
	$('#manualbtn').hide();
	//$('button').hide();
});
 var X8, X9, Y8, Y9,X3, Y3, X4, Y4,stillcount, offset, mmodewidth, mmodeheight,taskcount;

// --- Live M-mode preview while drawing the line -----------------------------
// Pre-extract the clip's frames (into prev/) up front so the preview can build
// from them while the user is still dragging. Kept separate from the real
// generation frames (stills.*) so there's never a file conflict.
function extractFramesForPreview() {
	if (!LIVE_PREVIEW || framesReady) return;
	try { if (!fs.existsSync(workdir + '/prev')) { fs.mkdirSync(workdir + '/prev'); } } catch (e) {}
	// Downscale the preview frames (height PREVIEW_H) — decode + rotate cost
	// scales with pixels, and the preview is shown small, so this is a big
	// speedup with no visible quality loss. Don't upscale small clips.
	var args = ['-i', workdir + '/temp.mp4', '-an', '-y', '-f', 'image2', '-qscale:v', '2', '-q:v', '1'];
	if (window.height > PREVIEW_H) { args.push('-vf', 'scale=-2:' + PREVIEW_H); }
	args.push(workdir + '/prev/p.%05d.png');
	var child = spawn(ffmpegpath, args, { windowsVerbatimArguments: true });
	child.on('close', function (code) {
		if (code !== 0) { return; }
		// cache the actual downscaled dimensions for the build/coord scaling
		mmmagick.getDimensions(workdir + '/prev/p.00001.png').then(function (d) {
			previewW = d.w; previewH = d.h; framesReady = true;
		}).catch(function () {});
	});
	child.on('error', function () {});
}
// Coalesced throttle: only one ffmpeg build runs at a time and it always builds
// the latest line position, so the drag stays smooth (the build is an async
// spawn off the main thread) and the preview just catches up a beat behind.
function requestPreview(x1, y1, x2, y2) {
	if (!LIVE_PREVIEW || !framesReady) { return; }
	previewPending = { x1: x1, y1: y1, x2: x2, y2: y2 };
	if (!previewBusy) { runPreview(); }
}
function runPreview() {
	if (!previewPending) { return; }
	var p = previewPending; previewPending = null; previewBusy = true;
	var out = workdir + '/preview.strip.png';
	var angle = mmmagick.angleDeg(p.x1, p.y1, p.x2, p.y2);   // rotation angle is scale-invariant
	// scale the line coords into the downscaled preview-frame space
	var f = previewW / window.width;
	mmffmpeg.buildStrip(ffmpegpath, workdir + '/prev/p.%05d.png', 1, stillcount, previewW, previewH,
		Math.round(p.x1 * f), Math.round(p.y1 * f), angle, out)
		.then(function () {   // no trim — show the full strip (black borders included)
			$('#mmodepreviewimg').attr('src', out + '?' + Date.now());
			$('#mmodepreview').css('display', 'block');
		})
		.catch(function () {})
		.then(function () { previewBusy = false; if (previewPending) { runPreview(); } });
}
// ----------------------------------------------------------------------------
function selectline(){
  var can = document.getElementById('selectlinecanvas');
  var ctx = can.getContext('2d');
  var startX, startY;

  $("#selectlinecanvas").mousedown(function(event) {   // line-select canvas only (was $("canvas") — fired on the calibrate canvas too)
          var totalOffsetX = 0;
          var totalOffsetY = 0;
          var canvasX = 0;
          var canvasY = 0;
          var currentElement = this;

          do {
                  totalOffsetX += currentElement.offsetLeft - currentElement.scrollLeft;
                  totalOffsetY += currentElement.offsetTop - currentElement.scrollTop;
          }
          while (currentElement = currentElement.offsetParent)

          startX = event.pageX - totalOffsetX;
          startY = event.pageY - totalOffsetY;

          var width = $(this).attr('width');
          var height = $(this).attr('height');
          drawLine(startX, 0, startX, height);
          drawAnchor(startX, startY);
          $(this).bind('mousemove', function(e) {
                  var X1 = startX;
                  var Y1 = startY;
                  var X2 = e.pageX - totalOffsetX;
                  var Y2 = e.pageY - totalOffsetY;
                  X3 = "0";
                  Y3 = "0";
                  X4 = "0";
                  Y4 = "0";
                  // Y = slope*x + b
                  var slope = (Y2 - Y1) / (X2 - X1);
                  if (X2 == X1) {
                          slope = 10000000;
                  }
                  var b = Y2 - (slope * X2);
                  var Xint = -1 * b / slope; //x axis intersect = top
                  var Yint = b; //y axis intersect = left
                  var XBint = (height - b) / slope; //Height intersect = bottom
                  var YRint = width * slope + b; //Width intersect = right


                  if (Xint > 0 && Xint < width) {
                          X3 = Xint;
                          Y3 = "0";
                  }

                  if (Yint > 0 && Yint < height) {
                          if (X3 > 0 || Y3 > 0) {
                                  X4 = "0";
                                  Y4 = Yint;
                          } else {
                                  X3 = "0";
                                  Y3 = Yint;
                          }
                  }

                  if (XBint > 0 && XBint < width) {
                          if (X3 > 0 || Y3 > 0) {
                                  X4 = XBint;
                                  Y4 = height;
                          } else {
                                  X3 = XBint;
                                  Y3 = height;
                          }
                  }
                  if (YRint > 0 && YRint < height) {
                          if (X3 > 0 || Y3 > 0) {
                                  X4 = width;
                                  Y4 = YRint;
                          } else {
                                  X3 = width;
                                  Y3 = YRint;
                          }
                  }
                  drawLine(X3, Y3, X4, Y4);
                  drawAnchor(X1, Y1);
          });
  }).mouseup(function() {
          $(this).unbind('mousemove');
  });



  function drawAnchor(xa, ya) {
          ctx.fillStyle = 'rgba(0,155,205,0.8)';
          ctx.beginPath();
          ctx.arc(xa, ya, 10, 0, Math.PI * 2);
          ctx.fill();
  }

  function drawLine(x, y, stopX, stopY) {
          ctx.strokeStyle = 'rgba(0,155,205,0.8)';
          //ctx.strokeStyle="#009BCD";
          ctx.lineWidth = 3;
          ctx.clearRect(0, 0, can.width, can.height);
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(stopX, stopY);
          ctx.closePath();
          ctx.stroke();

          X8 = Math.round(x);
          Y8 = Math.round(y);
          X9 = Math.round(stopX);
          Y9 = Math.round(stopY);
          if (Y9 < Y8 && X8 > 0) {
                  X10 = X9;
                  Y10 = Y9;
                  X9 = X8;
                  Y9 = Y8;
                  X8 = X10;
                  Y8 = Y10;
          }
          var resultsall = X8 + "," + Y8;
          requestPreview(X8, Y8, X9, Y9);   // live M-mode preview as the line moves
  }
}

$('#selectlineok').click(function(){
   if(X8+Y8+X9+Y9>0){
	$('#mmodepreview').hide();   // line committed — drop the live preview
        var X1=Math.round(X8);
        var Y1=Math.round(Y8);
        var X2=Math.round(X9);
        var Y2=Math.round(Y9);

	//var angle = 180*Math.atan2(X2-X1,Y2-Y1)/3.14159265359;
	//console.log(angle);
	$('#myprogresswrap').hide();   // generation is ~instant now — no progress bar
	$('#selectlinemsg').hide();
	$('#selectlineok').hide();
        $('#restart').hide();
        $('#selectlinewrap').hide();
	// Only go through calibration the first time. On a reselect (already
	// calibrated) we reuse the calibration and reveal the new m-mode directly.
	if (!calibrated) {
		$('#calibratewrap').show();
		$('#calibratemsg').slideDown();
	} else {
		// reselect: no calibrate step — hide the 2D clip and show a loading bar
		// while ffmpeg rebuilds the strip (otherwise the screen goes blank).
		$('#selectline').hide();
		genBarActive = true;
		$('#loading-text').text('Generating M-mode');
		$('#loading-container').show();
		startPreviewBar();
	}
	console.log(X1,Y1,X2,Y2);
	mmode(X1,Y1,X2,Y2);
   }
});
function getoffset(x1,y1,x2,y2,posterin,posterout,workdir) {
	// magick-wasm: best-fit SRT distort → page X offset (the old `-format %X`),
	// plus the line angle. Stored globally for the per-frame column extraction.
	return () => mmmagick.getOffset(posterin, x1, y1, x2, y2).then(function (r) {
		window.mmOffset = r.offset;
		window.mmAngle = r.angle;
		console.log('offset:', r.offset, 'angle:', r.angle);
	});
}
// Per-frame task: distort the frame so the drawn line is vertical, crop its
// 3px column, overwrite the still in place (replaces mmodeify.sh).
function mmodeColumnTask(infile, x1, y1) {
	return () => mmmagick.extractColumn(infile, infile, x1, y1, window.mmAngle, Math.round(x1 - window.mmOffset - 1));
}
// Concat task: +append every frame's column → mmode.png, then stack the poster
// under it and trim (replaces concat.sh).
function concatMmodeTask(workdir, count) {
	return () => {
		var cols = [];
		for (var k = 1; k <= count; k++) { cols.push(workdir + '/stills.' + String("00000" + k).slice(-5) + '.png'); }
		// Keep the clean strip (mmode.strip.png) so "Save with measurements" can
		// composite the annotation overlay over it; mmode.png is strip + poster.
		return mmmagick.appendColumns(cols, workdir + '/mmode.strip.png')
			.then(function () { return mmmagick.appendPosterLeft(workdir + '/posterbig.png', workdir + '/mmode.strip.png', workdir + '/mmode.png'); });
	};
}
// One-pass ffmpeg M-mode: build the whole strip natively, trim it, size the
// display + measurement canvas to it, show it, and build the saved asset
// (index poster on the LEFT of the strip). Replaces the per-frame magick loop.
function buildMmodeFfmpegTask(x1, y1, x2, y2, workdir) {
	return () => {
		var angle = mmmagick.angleDeg(x1, y1, x2, y2);
		var raw = workdir + '/mmode.strip.raw.png';
		var strip = workdir + '/mmode.strip.png';
		var N = fs.readdirSync(workdir).filter(function (f) { return /^stills\.\d+\.png$/.test(f); }).length;
		return mmmagick.getDimensions(workdir + '/stills.00001.png').then(function (d) {
			return mmffmpeg.buildStrip(ffmpegpath, workdir + '/stills.%05d.png', 1, N, d.w, d.h, x1, y1, angle, raw);
		}).then(function () {
			return mmmagick.trim(raw, strip);
		}).then(function () {
			return mmmagick.getDimensions(strip);
		}).then(function (dim) {
			mmodewidth = dim.w;
			mmodeheight = dim.h;
			if (mmodeheight > 770) { mmodeheight = 770; }   // display cap (matches old behavior)
			$('#mmodewrap').css({ height: mmodeheight + 'px', width: mmodewidth + 'px' });
			$('#mmodecanvas').attr('height', mmodeheight).attr('width', mmodewidth);
			$('#mmode').css({ height: mmodeheight + 'px', width: mmodewidth + 'px' });
			$('#slices').css({ height: mmodeheight + 'px', width: mmodewidth + 'px' });
			$('#slices').html('<img class="mmodestrip" draggable="false" src="' + strip + '?' + Date.now() +
				'" style="display:block;width:' + mmodewidth + 'px;height:' + mmodeheight + 'px;">');
			// Saved m-mode: full-res index poster (with the line) to the LEFT of the strip.
			return mmmagick.appendPosterLeft(workdir + '/posterbig.png', strip, workdir + '/mmode.png');
		});
	};
}
function mmodequeue(x1,y1,x2,y2,infile,workdir) {
	return () => new Promise((resolve, reject) => {
		var mymmodequeue=[];
		for (i = 1; i <= stillcount; i++) {
			//console.log("mmode offset:"+offset);
			//console.log("seting up mmode task: "+i);
                	var infile = workdir+'/stills.'+String("00000" + i).slice(-5)+'.png';
                	//console.log("infile:"+infile);
                	mymmodequeue.push(mmodeColumnTask(infile, x1, y1));
			if(i==1){
				mymmodequeue.push(getmmodedimensions());
			}
                	//console.log(i,x1,y1,x2,y2,infile,magickpath,workdir);
                	mymmodequeue.push(progress(i));
        	}
		mymmodequeue.push(concatMmodeTask(workdir, stillcount));
        	mymmodequeue.push(showmmode(1));
		//mymmodequeue.push(getmmodedimensions());
		window.t0 = performance.now();
		queue(mymmodequeue).then(([cmd, args]) => {
                	console.log(cmd + ' finished - all finished');
        	}).catch(TypeError, function(e) {}).catch(err => console.log(err));
		resolve(1);
	 });
}
function getmmodedimensions(){
    // The first frame's column has already been written to stills.00001.png;
    // its height is the m-mode height. Width = one 3px column per frame.
    return () => mmmagick.getDimensions(workdir+'/stills.00001.png').then(function (dim) {
		mmodeheight = dim.h;
		if (mmodeheight > 770) { mmodeheight = 770; }
		mmodewidth = stillcount * 3;
		$('#mmodewrap').css('height', mmodeheight+'px');
		$('#mmodewrap').css('width', mmodewidth+'px');
		$('#mmodecanvas').attr('height', mmodeheight);
		$('#mmodecanvas').attr('width', mmodewidth);
		$('#mmode').css('height', mmodeheight+'px');
		$('#mmode').css('width', mmodewidth+'px');
		$('#slices').css('height', mmodeheight+'px');
		$('#slices').css('width', mmodewidth+'px');
    });
}
function mmode(x1,y1,x2,y2) {
	var myqueue = [];
         //$('#loading-mm-container').show();
	//myqueue.push(getstillnum());
        var infile = workdir + '/temp.mp4';
	var outfile = workdir + '/stills.%05d.png';
        myqueue.push(customSpawn(ffmpegpath, ['-i', infile, '-an', '-y', '-f', 'image2', '-qscale:v', '2', '-q:v', '1', outfile]));
	//myqueue.push(progress(1));
	//spawnsync(ffmpegpath, ['-i', infile, '-an', '-y', '-f', 'image2', '-qscale:v', '2', '-q:v', '1', outfile]);
	var linetext = '-draw "line '+x1+','+y1+','+x2+','+y2+'"';
	var posterin= workdir + '/stills.00001.png';
	var posterout=workdir + '/poster.png';
	var posterbig=workdir + '/posterbig.png';
	//spawnsync(ffmpegpath, ['-i', infile, '-an', '-y', '-f', 'image2', '-qscale:v', '2', '-q:v', '1', '-vframes', '1', posterin]);
	//myqueue.push(firststill());
	//myqueue.push(progress(2));
	//console.log(x1,y1,x2,y2,posterin,posterout,magickpath, workdir);
/*
	var childProcess = spawnsync(getoffsetpath, [x1,y1,x2,y2,posterin,posterout,magickpath, workdir],{
		cwd: process.cwd(),
    		env: process.env,
    		stdio: 'pipe',
    		encoding: 'utf-8',
	});
	var offset=childProcess.stdout.toString();
	var childProcess = spawnsync(ffprobepath, ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames', '-of', 'default=nokey=1:noprint_wrappers=1', filelist[0]],{
                cwd: process.cwd(),
                env: process.env,
                stdio: 'pipe',
                encoding: 'utf-8',
        });
        stillcount=childProcess.stdout.toString();
*/
	//myqueue.push(getstillnum());
	if (!calibrated) { $('#calibrateok').addClass('btndisabled').show(); }   // greyed until a line is drawn (skip on reselect)
	myqueue.push(() => mmmagick.drawPoster(posterin, x1, y1, x2, y2, posterbig, posterout, 250));
	//myqueue.push(progress(3));
	if (USE_FFMPEG) {
		myqueue.push(buildMmodeFfmpegTask(x1, y1, x2, y2, workdir));
		myqueue.push(showmmode(1));
	} else {
		myqueue.push(getoffset(x1, y1, x2, y2, posterin, posterout, workdir));
		myqueue.push(mmodequeue(x1, y1, x2, y2, infile, workdir));
	}
	//myqueue.push(customSpawn(concatpath, [workdir]));
	//myqueue.push(showmmode(1));
//ABOVE
	//var childProcess = spawnsync(magickpath, ['convert', '-strokewidth','3','-stroke','white', linetext, posterin, posterout],{
/*
	var childProcess = spawnsync(posterpath, [x1,y1,x2,y2,posterin,posterout,magickpath],{
    cwd: process.cwd(),
    env: process.env,
    stdio: 'pipe',
    encoding: 'utf-8',
	windowsVerbatimArguments: true
});
*/
	//console.log(childProcess.output.toString());
	//console.log(magickpath+' convert -strokewidth 3 -stroke white '+ linetext+' '+ posterin+' '+ posterout);
	//console.log(posterpath+' '+x1+' '+y1+' '+x2+' '+y2+' '+posterin+' '+posterout+' '+magickpath);
        queue(myqueue).then(([cmd, args]) => {
                console.log(cmd + ' finished - all finished');
        }).catch(TypeError, function(e) {}).catch(err => console.log(err));
}
function addanimate(mmodesliceid){
	$('#'+mmodesliceid).addClass('mmodesliceanimate');			
	//console.log(mmodesliceid);
}
var delay=0;
// Reveal the finished M-mode with a left-to-right "trace" wipe — time runs
// left→right, so the strip sweeps in like a live M-mode being drawn.
function revealMmode() {
	var doReveal = function () {
		$('#loading-container').hide();
		$('#mmodewrap').show();
		$('#mmodemsg').show();
		$('#restart').show();
		$('#save').show();
		$('#recalibrate').show();
		$('#reselectline').show();
		$('#mmode').show();
		// Reference still (with the drawn line) below the buttons in the sidebar.
		$('#poster').html('<img draggable="false" src="' + workdir + '/poster.png?' + Date.now() + '">').show();
		$('#slices').stop(true, false).css('width', 0).animate({ width: mmodewidth }, 900);
	};
	// If the generation loading bar was showing (reselect flow), let it finish
	// first; otherwise reveal immediately (first run reveals on calibrate OK).
	if (genBarActive) { genBarActive = false; finishPreviewBar(doReveal); }
	else { doReveal(); }
}
function showmmode(i) {
        return () => new Promise((resolve, reject) => {
		mmodedone=1;
		// If calibration is already done, this is the last step → reveal now.
		// Otherwise the reveal happens when the user finishes calibrating (OK).
		if(calibrated){ revealMmode(); }
                resolve(i);
        });
}
var ppcm;
var calcm = 4;                               // cm spanned by the calibration line (user-selectable)
var measText = '', measColor = '#FFF000';   // latest measurement value, drawn onto the canvas so it saves
var lastMeas = null;                         // last drawn measurement, so it can be re-rendered after recalibration
$(document).on('mousedown', '#calibratecanvas', function (event) {
	can = document.getElementById('calibratecanvas');
	ctx = can.getContext('2d');
        var totalOffsetX = 0;
        var totalOffsetY = 0;
        var canvasX = 0;
        var canvasY = 0;
        var currentElement = this;

        do {
            totalOffsetX += currentElement.offsetLeft;// - currentElement.scrollLeft;
            totalOffsetY += currentElement.offsetTop;// - currentElement.scrollTop;
        }
        while (currentElement = currentElement.offsetParent)

        startX = event.pageX - totalOffsetX;
        startY = event.pageY - totalOffsetY;

        // Track on the document (namespaced) so the drag follows even off-canvas
        // and, critically, unbinds correctly on release — set the calibration.
        function onCalMove(e) {
            endX = e.pageX - totalOffsetX;
            endY = e.pageY - totalOffsetY;
            drawCalLine(startX, startY, endX, endY);
        }
        function onCalUp() {
            $(document).off('mousemove.cal', onCalMove);
            $(document).off('mouseup.cal', onCalUp);
        }
        $(document).on('mousemove.cal', onCalMove);
        $(document).on('mouseup.cal', onCalUp);
    });



var lastCal = null;   // remember the calibration line so we can redraw on cm change
function drawCalLine(x, y, stopX, stopY) {
        lastCal = { x: x, y: y, stopX: stopX, stopY: stopY };
        ctx.strokeStyle = 'rgba(0,153,255,0.85)';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.clearRect(0, 0, can.width, can.height);
        // main caliper line
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(stopX, stopY);
        ctx.stroke();
        var pixelLength = Math.round(Math.sqrt(Math.pow((stopX - x), 2) + Math.pow((stopY - y), 2)));
        // pixels per cm = measured length / number of cm spanned (calcm).
        ppcm = parseFloat(Math.round(pixelLength * 10 / calcm) / 10).toFixed(1);
        // Perpendicular unit vector for the end caps and tick marks.
        var dx = stopX - x, dy = stopY - y;
        var len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1) { return; }
        $('#calibrateok').removeClass('btndisabled');   // a real line exists → enable OK
        var px = -dy / len, py = dx / len;
        // End caps at both ends (longer), then calcm-1 evenly spaced cm ticks.
        drawCalTick(x, y, px, py, 9);
        drawCalTick(stopX, stopY, px, py, 9);
        for (var i = 1; i < calcm; i++) {
            var t = i / calcm;
            drawCalTick(x + dx * t, y + dy * t, px, py, 6);
        }
    }

// One tick perpendicular to the caliper, centered at (cx,cy), half-length `half`.
function drawCalTick(cx, cy, px, py, half) {
        ctx.beginPath();
        ctx.moveTo(cx - px * half, cy - py * half);
        ctx.lineTo(cx + px * half, cy + py * half);
        ctx.stroke();
}
// Changing the cm count re-scales ppcm and redraws the tick marks live.
$('#calcmselect').on('change', function () {
        calcm = parseInt($(this).val(), 10) || 4;
        if (lastCal) {
            can = document.getElementById('calibratecanvas');
            ctx = can.getContext('2d');
            drawCalLine(lastCal.x, lastCal.y, lastCal.stopX, lastCal.stopY);
        }
});
var calibrated=0;
var mmodedone=0;
$('#calibrateok').click(function(){
   if(ppcm){
	calibrated=1;
	$(this).hide();
	$('#selectlinewrap').hide();
	$('#selectline').hide();
	$('#calibratemsg').hide();
	console.log(ppcm);
	// Calibration just finished — if the m-mode is built, reveal it now with
	// the trace-wipe animation (this is the "final animation").
	if (mmodedone){
		revealMmode();
		// Re-render any existing measurement against the new ppcm/pps.
		if (lastMeas) { drawMeasurement(lastMeas.sX, lastMeas.sY, lastMeas.eX, lastMeas.eY); }
	}
    }
});
// Draw a measurement (calipers + arrows + value) on the m-mode canvas. Pulled
// out of the mousemove handler so it can be re-run after recalibration — which
// recomputes the value against the new ppcm/pps. Stores lastMeas for that.
function drawMeasurement(sX, sY, eX, eY) {
    can = document.getElementById('mmodecanvas');
    ctx = can.getContext('2d');
    ctx.clearRect(0, 0, can.width, can.height);
    var xdiff = Math.abs(eX - sX), ydiff = Math.abs(eY - sY);
    // When the gap is below this, the inward-pointing heads would converge and
    // clutter the middle, so flip them to sit fully OUTSIDE the lines pointing
    // OUTWARD (away from the gap). Above it, heads sit inside pointing out to
    // each line. The connector line always spans the middle.
    var ARROW_OUTSIDE = 48;
    if (ydiff > xdiff) {
        var direction = "h";
        var outside = ydiff < ARROW_OUTSIDE;
        drawLine4(sX, sY, sX, eY, direction, pps, ppcm, !outside);
        drawLine5(0, eY, can.width, eY, direction);
        drawLine5(0, sY, can.width, sY, direction);
        var top = Math.min(sY, eY), bot = Math.max(sY, eY);
        if (outside) {
            // heads point inward at each line; tails extend outward (away from gap)
            drawLine5(sX, top - ARROW_TAIL, sX, top, direction); arrowV(sX, top, +1);
            drawLine5(sX, bot, sX, bot + ARROW_TAIL, direction); arrowV(sX, bot, -1);
        } else { arrowV(sX, top, -1); arrowV(sX, bot, +1); }
    } else {
        var direction = "v";
        var outside = xdiff < ARROW_OUTSIDE;
        drawLine4(sX, sY, eX, sY, direction, pps, ppcm, !outside);
        drawLine5(eX, 0, eX, can.height, direction);
        drawLine5(sX, 0, sX, can.height, direction);
        var left = Math.min(sX, eX), right = Math.max(sX, eX);
        if (outside) {
            // heads point inward at each line; tails extend outward (away from gap)
            drawLine5(left - ARROW_TAIL, sY, left, sY, direction); arrowH(left, sY, +1);
            drawLine5(right, sY, right + ARROW_TAIL, sY, direction); arrowH(right, sY, -1);
        } else { arrowH(left, sY, -1); arrowH(right, sY, +1); }
    }
    // Value last, on top of the calipers, and on the canvas (not a DOM <div>)
    // so it's included when the m-mode is saved.
    if (measText) {
        ctx.font = 'bold 28px sans-serif';
        ctx.fillStyle = measColor;
        ctx.shadowColor = 'rgba(0,0,0,0.9)';
        ctx.shadowBlur = 4;
        ctx.fillText(measText, 18, 36);
        ctx.shadowBlur = 0;
    }
    lastMeas = { sX: sX, sY: sY, eX: eX, eY: eY };
}
$(document).on('mousedown', '#mmodecanvas', function(event) {
    can = document.getElementById('mmodecanvas');
    ctx = can.getContext('2d');
    ctx.clearRect(0, 0, can.width, can.height);
    $('#measureresult').hide();
    //console.log('clickmeas');
    var totalOffsetX = 0;
    var totalOffsetY = 0;
    var canvasX = 0;
    var canvasY = 0;
    var currentElement = this;

    do {
        totalOffsetX += currentElement.offsetLeft// - currentElement.scrollLeft;
        totalOffsetY += currentElement.offsetTop// - currentElement.scrollTop;
    }
    while (currentElement = currentElement.offsetParent)

    startX = Math.max(0, Math.min(can.width,  event.pageX - totalOffsetX));
    startY = Math.max(0, Math.min(can.height, event.pageY - totalOffsetY));

    // Track on the document so the drag keeps following even when the cursor
    // leaves the canvas, clamping to the canvas edge so the value maxes out
    // there ("max value of the outside dimension").
    function onMeasMove(e) {
        var ex = Math.max(0, Math.min(can.width,  e.pageX - totalOffsetX));
        var ey = Math.max(0, Math.min(can.height, e.pageY - totalOffsetY));
        drawMeasurement(startX, startY, ex, ey);
    }
    function onMeasUp() {
        $(document).off('mousemove.meas', onMeasMove);
        $(document).off('mouseup.meas', onMeasUp);
    }
    $(document).on('mousemove.meas', onMeasMove);
    $(document).on('mouseup.meas', onMeasUp);
});

function drawLine4(x, y, stopX, stopY, direction, pps, ppcm, drawConnector) {
        //console.log(ppcm);
    if (direction == 'v') {
        ctx.strokeStyle = "#67C8FF";
    } else {
        ctx.strokeStyle = "#FFF000";
    }
    ctx.lineWidth = 2;
    // The connector spanning the gap is suppressed in outside mode (small gaps).
    if (drawConnector !== false) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(stopX, stopY);
        ctx.closePath();
        ctx.stroke();
    }

    var pixelLength = Math.round(Math.sqrt(Math.pow((stopX - x), 2) + Math.pow((stopY - y), 2)));
    var pixelLengthX = Math.abs(stopX - x);
    var pixelLengthY = Math.abs(stopY - y);
    var time = parseFloat(Math.round(pixelLengthX * 100 / pps) / 100).toFixed(2);
    // ppcm = pixels per cm; ×10 → pixels per mm, so this is the distance in mm
    // (×100 then /10 keeps one decimal place).
    var dist = parseFloat(Math.round(pixelLengthY * 100 / ppcm) / 10).toFixed(1);
    if (direction == 'v') {
        measColor = '#67C8FF';
        measText = time + " s";
    } else {
        measColor = '#FFF000';
        measText = dist + " mm";
    }
    // measText/measColor are painted onto the canvas by the mousemove handler
    // (after the calipers/arrows) so the value is part of the saved overlay.
}

function drawLine5(x, y, stopX, stopY, direction) {
    if (direction == 'v') {
        ctx.strokeStyle = "#67C8FF";
    } else {
        ctx.strokeStyle = "#FFF000";
    }
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(stopX, stopY);
    ctx.closePath();
    ctx.stroke();
}
// Horizontal arrowhead: tip at (tipX,y), pointing right (dir=+1) or left (dir=-1).
// The body (the open "V") extends opposite the point, so dir=+1 puts the head to
// the LEFT of the tip and dir=-1 to the RIGHT — used to place heads inside or
// outside the caliper lines. Inherits the current strokeStyle (set by drawLine5).
var ARROW_LEN = 9, ARROW_W = 4, ARROW_TAIL = 32;
function arrowH(tipX, y, dir) {
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(tipX, y); ctx.lineTo(tipX - dir * ARROW_LEN, y - ARROW_W);
    ctx.moveTo(tipX, y); ctx.lineTo(tipX - dir * ARROW_LEN, y + ARROW_W);
    ctx.stroke();
}
// Vertical arrowhead: tip at (x,tipY), pointing down (dir=+1) or up (dir=-1).
function arrowV(x, tipY, dir) {
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, tipY); ctx.lineTo(x - ARROW_W, tipY - dir * ARROW_LEN);
    ctx.moveTo(x, tipY); ctx.lineTo(x + ARROW_W, tipY - dir * ARROW_LEN);
    ctx.stroke();
}
$('#restart').click(function(){
/*
	spawn('rm',[workdir+'/temp.mp4'])
	$('#selectlinemsg').hide();
	$('#selectline').hide();
	$("#filelistwrap").show();
	$('#maintitle').show();
	$('.added').remove();
	$('#mmode').hide();
	$('#mmodemsg').hide();
	$(this).hide();
	$('#progressmsg').css('margin-top','15px');
	$('#timeleft').hide();
	filelist=[];
*/
	spawnsync('rm',['-rf',workdir]);
	$( "#fadetoblack" ).show();
	$( "#fadetoblack" ).animate({
    		opacity: 1,
  	}, 300, function() {
		location.reload();
  	});
});
/*
$('#save').click(function(){
	console.log(path.basename(filelist[0]));
        dialog.showSaveDialog({
    title: 'Save M.mode.ify',
    defaultPath: '~/Desktop/'+fileonly+'.mmode.png'
  }, function (fileName) {
       if (fileName === undefined){
            console.log("You didn't save the file");
            return;
       }
	var filearr=fileName.toLowerCase().split('.');
	var ext=filearr.pop();
        if(ext!='png'){
		console.log('ext='+ext+',adding png');
        	fileName=fileName+'.png';
        }
        fs.createReadStream(workdir+'/mmode.png').pipe(fs.createWriteStream(fileName));
	}); 
});
*/
$('#reselectline').click(function(){
	// Back to line selection, keeping the existing calibration. Frames are
	// already extracted, so the live preview works immediately.
	$('#mmode').hide(); $('#mmodewrap').hide(); $('#mmodemsg').hide();
	$('#poster').hide(); $('#save').hide(); $('#recalibrate').hide(); $(this).hide();
	$('#calibratewrap').hide(); $('#calibratemsg').hide(); $('#calibrateok').hide();
	var slc = document.getElementById('selectlinecanvas');
	if (slc) { slc.getContext('2d').clearRect(0, 0, slc.width, slc.height); }
	$('#selectline').show(); $('#selectlinewrap').show();
	$('#selectlinemsg').show(); $('#selectlineok').show(); $('#restart').show();
});
$('#recalibrate').click(function(){
	calibrated=0;
	postershown=0;
	// The m-mode is already built — hide the leftover progress UI so it doesn't
	// overlap the calibrate prompt.
	$('#myprogresswrap').hide();
	$('#progressmsg').hide();
	$('#timeleft').hide();
	$('#calibratemsg').slideDown();
	$('#mmode').hide();
        $('#mmodewrap').hide();
        $('#mmodemsg').hide();
        $('#restart').hide();
        $('#save').hide();
        $('#poster').hide();
	$('#selectline').show();
	$('#selectlinewrap').hide();   // we're calibrating, not re-picking the line
	$('#calibratewrap').show();    // make the calibration canvas visible/drawable
	$(this).hide();
	$('#calibrateok').show();
	// Redraw the previous calibration line so it can be seen and adjusted.
	if (lastCal) {
		can = document.getElementById('calibratecanvas');
		ctx = can.getContext('2d');
		drawCalLine(lastCal.x, lastCal.y, lastCal.stopX, lastCal.stopY);
	}
	
});

function decodeBase64Image(dataString) {
  var matches = dataString.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/),
    response = {};

  if (matches.length !== 3) {
    return new Error('Invalid input string');
  }

  response.type = matches[1];
  response.data = Buffer.from(matches[2], 'base64');

  return response;
}

$('#save').click(function(){
	// Flatten the measurement annotations onto the m-mode without a screenshot.
	// The annotations live on the transparent overlay canvas (#mmodecanvas),
	// whose pixel buffer is the on-screen m-mode size. Export it as a PNG and
	// composite it over the clean strip with magick-wasm, then append the poster
	// and trim — same output as the plain Save, plus the measurements.
	// (Old approach: desktopCapturer window screenshot + pixel-offset crop —
	//  required Screen Recording permission and broke on HiDPI displays.)
	var overlayBuffer = decodeBase64Image(document.getElementById('mmodecanvas').toDataURL('image/png'));
	dialog.showSaveDialog({
		title: 'Save M.mode.ify with measurements',
		defaultPath: '~/Desktop/'+fileonly+'.mmode.png'
	}).then(function (result) {
		var fileName = result.filePath;
		if (result.canceled || !fileName){
			console.log("You didn't save the file");
			return;
		}
		var filearr=fileName.toLowerCase().split('.');
		var ext=filearr.pop();
		if(ext!='png'){
			console.log('ext='+ext+',adding png');
			fileName=fileName+'.png';
		}
		var overlayPath=workdir+'/measoverlay.png';
		var tempimage=workdir+'/temp.mm.meas.png';
		fs.writeFile(overlayPath, overlayBuffer.data, function(err) {
			if (err) { console.error('save (overlay write) error:', err); return; }
			mmmagick.compositeOver(workdir+'/mmode.strip.png', overlayPath, tempimage)
				.then(function () { return mmmagick.appendPosterLeft(workdir+'/posterbig.png', tempimage, fileName); })
				.catch(function (e) { console.error('save (magick) error:', e); });
		});
	});
});


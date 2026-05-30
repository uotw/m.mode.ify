// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// All of the Node.js APIs are available in this process.
const {desktopCapturer, screen} = require('electron');
var Jimp = require("jimp");
var remote = require('electron').remote; 
var dialog = remote.dialog;
var $ = require('jQuery');
var path = require('path');
require('shelljs/global');
const osTmpdir = require('os-tmpdir');
var ostemp = osTmpdir();
const {shell} = require('electron');
var appRootDir = require('app-root-dir').get();
// Cross-platform ffmpeg/ffprobe from ffmpeg-static + ffprobe-static (macOS
// arm64/x64 + Windows x64), resolved in ./ffmpeg-paths.js. The spawn() calls
// below are unchanged — they just use these resolved paths.
var ffmpegPaths = require('./ffmpeg-paths');
var ffmpegpath = ffmpegPaths.ffmpegPath;
var ffprobepath = ffmpegPaths.ffprobePath;
// NOTE: dicom2jpeg is NOT provided by ffmpeg-static — DICOM input still relies on
// this hand-bundled, macOS-only binary (out of scope for the static-binary swap).
var dicom2jpegpath = appRootDir + '/node_modules/ffmpeg/dicom2jpeg';
var appswitchpath = appRootDir + '/node_modules/imagemagick/appswitch';
var curlpath = appRootDir + '/node_modules/curl/curl';
var magickpath = appRootDir + '/node_modules/imagemagick/magick';
var posterpath = appRootDir + '/poster.sh';
var getoffsetpath = appRootDir + '/getoffset.sh';
var mainpath = appRootDir + '/main.sh';
var mmodepath = appRootDir + '/mmodeify.sh';
var concatpath = appRootDir + '/concat.sh';
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

function run_cmd(cmd, args, callBack) {
	var spawn = require('child_process').spawn;
	var child = spawn(cmd, args);
	var resp = "";
	child.stdout.on('data', function(buffer) {
		resp += buffer.toString()
	});
	child.stdout.on('end', function() {
		callBack(resp)
	});
} // ()
var isdicom=0;
function isclip(filename,filewithpath) {
	var clipext = ['mp4', 'm4v', 'avi', 'wmv', 'mov', 'flv', 'mpg', 'mpeg'];
	for (var i = 0; i < clipext.length; i++) {
		if (filename.toLowerCase().split('.').pop().indexOf(clipext[i]) >= 0) {
			return (1);
		}
	}
	var filetype=spawnsync('file',['-Ib', filewithpath,]); // '| grep -i dicom']);
	var filetyperesult=filetype.stdout.toString().toLowerCase();
	var dicomsearch=filetyperesult.indexOf('dicom');
	//console.log(filetyperesult, isdicom);
	if(dicomsearch>-1){
		isdicom=1;
		return(1);
	}
	return (0);
}

function isstill(filename) {
	var stillext = ['jpg', 'jpeg', 'png', 'bmp', 'tiff', 'gif'];
	for (var i = 0; i < stillext.length; i++) {
		if (filename.toLowerCase().split('.').pop().indexOf(stillext[i]) >= 0) {
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
		} else if (isclip(filename, files[i].path)>0) {
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
$("#filelistwrap").on('drop', function(event) {
	event.preventDefault();
	filelist=[];
	var files = event.originalEvent.dataTransfer.files;
	spawn(appswitchpath, [ '-a', 'M.mode.ify']);
	//spawn(appswitch -a "ClipDeidentifier"
	for (var i = 0; i < files.length; i++) {
		var name = files[i].name;
		var pathn = files[i].path;
		if (fs.lstatSync(pathn).isDirectory()) {
			var temp_list = [];
			temp_list = search(pathn);
			for (var k = 0; k < temp_list.length; k++) {
				if (filelist.indexOf(temp_list[k]) == -1) {
					filelist.push(temp_list[k]);
					index = filelist.length;
					//$('#filelist').append(index + ': ' + temp_list[k] + '<br />');
				}
			}
		} else if (isclip(name, files[i].path)>0) {
			if (filelist.indexOf(pathn) == -1) {
				filelist.push(pathn);
				index = filelist.length;
				//$('#filelist').append(index + ': ' + path + '<br />');
			}
		}
	}
	if(filelist.length=='0'){
		//console.log("no clip!");
		$('#drag').html('ugh, no clip found, try again');
	} else {
		$('#sidebar').show();
		$('#drag').css('visibility','hidden');
		$("#filelistwrap").hide();
		$('#maintitle').hide();
		 $('#loading-container').show();
		preview();
	}
});
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
$(document).on('drop', function(e) {
	e.stopPropagation();
	e.preventDefault();
});
/*
function deidentify(filelist, croppixels) {
	var temp = maketemp();
	outfile = '/tmp/' + temp + '.mp4';
	console.log("saving to: " + outfile);
	ffmpeg = spawn(ffmpegpath, ['-i', clips[0], '-an', '-q:v', '1', '-vcodec', 'libx264', '-y', '-pix_fmt', 'yuv420p', '-vf', 'setsar=1,scale=trunc(iw/2)*2:trunc(ih/2)*2,crop=in_w:in_h-50:0:50', outfile]);
	if (ffmpeg.status.toString() == 0) {
		console.log('successful transcoding for: ' + clips[0]);
		folder = 'daaskjh876';
		localfile = 'file=@' + outfile;
		uploadlink = 'https://www.ultrasoundoftheweek.com/cspublic/curlupload.php?&f=' + folder;
		curlsend = spawn(curlpath, ['-i', '-F', localfile, uploadlink]);
		if (curlsend.status.toString() == 0) {
			console.log('sucessful upload for: ' + outfile);
		} else {
			console.log("curl ERROR: " + curlsend.stderr.toString());
		}
	} else {
		console.log("ffmpeg ERROR: " + ffmpeg.output.toString());
	}
}  //for first curl use curl -b cookie.txt, then use curl -b cookie.txt to avoid re-authentication and set session var
*/

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
function preview() {
	fileonly=path.basename(filelist[0], path.extname(filelist[0]));
	console.log(fileonly);
	$('#loading-container').show();
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
	if (isdicom==0){
        	myqueue.push(customSpawn(ffmpegpath, ['-i', filelist[0], '-an', '-y', '-vf', vftext, outfile]));
	} else {
		myqueue.push(customSpawn(dicom2jpegpath, [ filelist[0], 'dicomtemp.jpg', '-ffmpeg', ffmpegpath, '-y', '-vf', vftext, outfile]));
	}
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
		$('#selectlinemsg').show();
		$('#selectline').append(cliphtml);
		$('#selectline').fadeIn(1500);
		//$('#selectlinewrap').show();
		$('#loading-container').hide();
		$('#restart').show();
		$('#selectlineok').show();
		
		
		selectline();
		//console.log(cliphtml);

		//imagehtml = '<td><img src="' + outfile + '" width="' + widthcrop + 'px" height="' + heightcrop + 'px"></img></td>';
		resolve(i);
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
function selectline(){
  var can = document.getElementById('selectlinecanvas');
  var ctx = can.getContext('2d');
  var startX, startY;

  $("canvas").mousedown(function(event) {
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
  }
}

$('#selectlineok').click(function(){
   if(X8+Y8+X9+Y9>0){
        var X1=Math.round(X8);
        var Y1=Math.round(Y8);
        var X2=Math.round(X9);
        var Y2=Math.round(Y9);

	//var angle = 180*Math.atan2(X2-X1,Y2-Y1)/3.14159265359;
	//console.log(angle);
	$('#myProgress').slideDown();
	$('#selectlinemsg').hide();
	$('#selectlineok').hide();
        $('#restart').hide();		
	$('#progressmsg').show();
	$('#calibratewrap').show();
        $('#selectlinewrap').hide();
	$('#calibratemsg').slideDown();
	console.log(X1,Y1,X2,Y2);
	
//HERE
/*
	var myqueue = [];
         //$('#loading-mm-container').show();
        //myqueue.push(getstillnum());
        var infile = workdir + '/temp.mp4';
        var outfile = workdir + '/stills.%05d.png';
       spawnsync(ffmpegpath, ['-i', infile, '-an', '-y', '-f', 'image2', '-qscale:v', '2', '-q:v', '1', outfile]);
        var posterin= workdir + '/stills.00001.png';
        var posterout=workdir + '/poster.png';
	var offset=spawn(mainpath, [X1,Y1,X2,Y2,posterin,posterout,magickpath, workdir]);
	offset.stdout.on('data', (data) => {
                        console.log("main:"+data.toString());
                        offset=data.toString();
                 });
*/
	//HERE!
	mmode(X1,Y1,X2,Y2);
   }
});
function getoffset(x1,y1,x2,y2,posterin,posterout,magickpath, workdir) {
	//const exec = require('child_process').exec;
		//console.log(x1,y1,x2,y2,posterin,posterout,magickpath, workdir);
	return () => new Promise((resolve, reject) => {
		console.log(x1,y1,x2,y2,posterin,posterout,magickpath, workdir);
		var offsetdata=spawn(getoffsetpath, [x1,y1,x2,y2,posterin,posterout,magickpath, workdir]);
        	offsetdata.stdout.on('data', (data) => {
                	console.log("offset:"+data.toString());
			offset=data.toString();
			resolve(1);
		 });
        });
}
function getstillnum(){
	return () => new Promise((resolve, reject) => {
                var stills=spawn(ffprobepath, ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames', '-of', 'default=nokey=1:noprint_wrappers=1', filelist[0]]);
                stills.stdout.on('data', (data) => {
                        //console.log("stillcount:"+data.toString());
                        stillcount=data.toString();
			mmodewidth=stillcount*3;
			$('#mmode').css('width', mmodewidth+'px');
                 });
                resolve(1);
        });
}
function mmodequeue(x1,y1,x2,y2,infile,magickpath,workdir) {
	return () => new Promise((resolve, reject) => { 
		//var mmode=spawn(mmodepath, [x1,y1,x2,y2,infile,magickpath,workdir, offset]);
		//console.log(x1,y1,x2,y2,infile,magickpath,workdir, offset);
		//POSTER CODE
/*
		$('#poster').html('<img src="'+workdir+'/posterbig.png"></img>');
		$('#poster').css('width',window.width);
*/
		var mymmodequeue=[];
		for (i = 1; i <= stillcount; i++) {
			//console.log("mmode offset:"+offset);
			//console.log("seting up mmode task: "+i);
                	var infile = workdir+'/stills.'+String("00000" + i).slice(-5)+'.png';
                	//console.log("infile:"+infile);
                	mymmodequeue.push(customSpawn(mmodepath, [x1,y1,x2,y2,infile,magickpath,workdir, offset]));
			if(i==1){
				mymmodequeue.push(getmmodedimensions());
			}
                	//console.log(i,x1,y1,x2,y2,infile,magickpath,workdir);
                	mymmodequeue.push(progress(i));
        	}
		mymmodequeue.push(customSpawn(concatpath, [workdir,magickpath]));
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
    return () => new Promise((resolve, reject) => {
	var mmodestill=workdir+'/stills.00001.png';
	var mmodedim=spawn(magickpath, ['convert', mmodestill, '-ping', '-format', '%w:%h', 'info:']);
        mmodedim.stdout.on('data', (data) => {
              	console.log(data.toString());
              	var info=data.toString();
		mmodeheight =info.split(":")[1];
		if (mmodeheight>770){
			mmodeheight=770;
		}
        	//mmodewidth = info.split(":")[0];
		//console.log(mmodeheight, mmodewidth);
		$('#mmodewrap').css('height', mmodeheight+'px');
                $('#mmodewrap').css('width', mmodewidth+'px');
                $('#mmodecanvas').attr('height', mmodeheight);
                $('#mmodecanvas').attr('width', mmodewidth);
		$('#mmode').css('height', mmodeheight+'px');
		$('#mmode').css('width', mmodewidth+'px');
		$('#slices').css('height', mmodeheight+'px');
		$('#slices').css('width', mmodewidth+'px');
        });
	resolve(1);
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
	myqueue.push(getoffset(x1,y1,x2,y2,posterin,posterout,magickpath, workdir));
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
	$('#calibrateok').show();
	myqueue.push(customSpawn(posterpath, [x1,y1,x2,y2,posterin,posterout,magickpath,posterbig]));
	//myqueue.push(progress(3));
	myqueue.push(mmodequeue(x1,y1,x2,y2,infile,magickpath,workdir));
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
function showmmode(i) {
        return () => new Promise((resolve, reject) => {
		//$('#timeleft').hide();
		//$('#poster').hide();
		$('#myprogresswrap').css('opacity','0');
		//$('#mmode').append('<img class=added src="'+workdir + '/mmode.png" ></img>');
		if(calibrated){
			$('#mmode').fadeIn(1500);
			$('#mmodewrap').show();
			$('#mmodemsg').show();
			$('#restart').show();
			$('#save').show();
			//$('#poster').hide();
			
			$('.mmodeslice').each(function(){
				var mmodesliceid=$(this).attr('id');
				setTimeout(addanimate.bind(null, mmodesliceid), delay);
				delay=delay+10;
			});
		}
		mmodedone=1;
                resolve(i);
        });
}
var ppcm;
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

        //ycorrect=$(canvas).offset() + $("html,body").scrollTop();
        $(this).bind('mousemove', function (e) {
            endX = e.pageX - totalOffsetX;
            endY = e.pageY - totalOffsetY;
            drawCalLine(startX, startY, endX, endY);
        /*
                //CALCULATE THE handle END POINTs
                var d = 20; //length of 1/2 handle
                var m = (startY-endY)/(startX-endX);
                var nx1 = startX + Math.sqrt(d / (1+(1/m)));
                var nx2 = startX - Math.sqrt(d / (1+(1/m)));
                var ny1 = startY + (startX-nx1)/m;
                var ny2 = startY + (startX-nx2)/m;
                drawCalLineArms(nx1,ny1,nx2,ny2);
        */
        });
    }).mouseup(function () {
        $(this).unbind('mousemove');
    });



function drawCalLine(x, y, stopX, stopY) {
        ctx.strokeStyle = 'rgba(0,153,255,0.8)';
        //ctx.strokeStyle="#009BCD";
        ctx.lineWidth = 3;
        ctx.clearRect(0, 0, can.width, can.height);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(stopX, stopY);
        ctx.closePath();
        ctx.stroke();
		var pixelLength = Math.round(Math.sqrt(Math.pow((stopX - x), 2) + Math.pow((stopY - y), 2)));
        var pixelLengthX = Math.abs(stopX - x);
        var pixelLengthY = Math.abs(stopY - y);
        var resultsall = pixelLength + "px";
        //$('.myResults').text(resultsall);
        ppcm = parseFloat(Math.round(pixelLength * 10/4)/10).toFixed(1);
        //console.log(ppcm);
    }

function drawCalLineArms(x, y, stopX, stopY) {
        ctx.strokeStyle = 'rgba(0,153,255,0.8)';
        //ctx.strokeStyle="#009BCD";
        ctx.lineWidth = 3;
        //ctx.clearRect(0, 0, can.width, can.height);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(stopX, stopY);
        ctx.closePath();
        ctx.stroke();
}
var calibrated=0;
var mmodedone=0;
$('#calibrateok').click(function(){
   if(ppcm){
	calibrated=1;
	if (mmodedone){
		$('#mmode').fadeIn(1500);
		$('#mmodewrap').show();
                $('#mmodemsg').show();
                $('#restart').show();
		$('#save').show();
		$('#recalibrate').show();
		//$('#poster').hide();
	}
	$(this).hide();
	$('#selectlinewrap').hide();
	$('#selectline').hide();	
	$('#calibratemsg').hide();
	//$('#recalibrate').show();
	console.log(ppcm);
/*
	$('#myprogresswrap').animate({   
		//marginTop: window.height+40+'px',
		width: "200px",
		
	}, 2000, function(){
*/
		$('#timeleft').show();
		$('#mmode').fadeIn(1500);
		$('#mmodewrap').show();
		$('#mmodemsg').show();
	//});
    }
});
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

    startX = event.pageX - totalOffsetX;
    startY = event.pageY - totalOffsetY;

    //ycorrect=$(canvas).offset() + $("html,body").scrollTop();
    $(this).bind('mousemove', function(e) {
        ctx.clearRect(0, 0, can.width, can.height);
        var xdiff = Math.abs(startX - e.pageX + totalOffsetX);
        var ydiff = Math.abs(startY - e.pageY + totalOffsetY);
        //var ppcm = $(this).attr('ppcm');
        //var pps = $(this).attr('pps');
        //console.log(ppcm,pps);
        if (ydiff > xdiff) {
            var direction = "h";
            drawLine4(startX, startY, startX, e.pageY - totalOffsetY, direction, pps, ppcm);
            drawLine5(0, e.pageY - totalOffsetY, slicetotal, e.pageY - totalOffsetY, direction);
		//
            drawLine5(0, startY, slicetotal, startY, direction);
            //drawLine5(0, e.pageY - totalOffsetY, 621, e.pageY - totalOffsetY, direction);
            //drawLine5(0, startY, 621, startY, direction);
            if (startY > e.pageY - totalOffsetY) {
                drawArrowV(startX, startY, 't', 'h');
                drawArrowV(startX, e.pageY - totalOffsetY, 'b', 'h');
            } else {
                drawArrowV(startX, startY, 'b', 'h');
                drawArrowV(startX, e.pageY - totalOffsetY, 't', 'h');
            }
        } else {
            var direction = "v";
            drawLine4(startX, startY, e.pageX - totalOffsetX, startY, direction,pps,ppcm);
            drawLine5(e.pageX - totalOffsetX, 0, e.pageX - totalOffsetX, can.height, direction);
            drawLine5(startX, 0, startX, can.height, direction);
            if (startX > e.pageX - totalOffsetX) {
                drawArrowH(startX, startY, 'r', 'v');
                drawArrowH(e.pageX - totalOffsetX, startY, 'l', 'v');
            } else {
                drawArrowH(startX, startY, 'l', 'v');
                drawArrowH(e.pageX - totalOffsetX, startY, 'r', 'v');
            }
        }
    });
}).mouseup(function() {
    $(this).unbind('mousemove');
});

function drawLine4(x, y, stopX, stopY, direction, pps, ppcm) {
        //console.log(ppcm);
    if (direction == 'v') {
        ctx.strokeStyle = "#67C8FF";
    } else {
        ctx.strokeStyle = "#FFF000";
    }
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(stopX, stopY);
    ctx.closePath();
    ctx.stroke();

    var pixelLength = Math.round(Math.sqrt(Math.pow((stopX - x), 2) + Math.pow((stopY - y), 2)));
    var pixelLengthX = Math.abs(stopX - x);
    var pixelLengthY = Math.abs(stopY - y);
    var time = parseFloat(Math.round(pixelLengthX * 10 / pps) / 10).toFixed(1);
    var dist = parseFloat(Math.round(pixelLengthY * 10 / ppcm) / 10).toFixed(1);
    if (direction == 'v') {
        $('#measureresult').css('color', '#67C8FF');
        var resultsall = time + " s ";
    } else {
        $('#measureresult').css('color', '#FFF000');
        var resultsall = dist + " cm";
    }  
    $('#measureresult').html(resultsall).show();
}

function drawLine5(x, y, stopX, stopY, direction) {
    if (direction == 'v') {
        ctx.strokeStyle = "#67C8FF";
    } else {
        ctx.strokeStyle = "#FFF000";
    }
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(stopX, stopY);
    ctx.closePath();
    ctx.stroke();
}
function drawArrowH(x, y, side, direction) {
    if (direction == 'v') {
        ctx.strokeStyle = "#67C8FF";
    } else {
        ctx.strokeStyle = "#FFF000";
    }
    if (side == 'r') {
        xoffset = -10;
        yoffset = 4;
    } else {
        xoffset = 10;
        yoffset = 4;
    }
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + xoffset, y - yoffset);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + xoffset, y + yoffset);
    ctx.closePath();
    ctx.stroke();
}
function drawArrowV(x, y, side, direction) {
    if (direction == 'v') {
        ctx.strokeStyle = "#67C8FF";
    } else {
        ctx.strokeStyle = "#FFF000";
    }
    if (side == 't') {
        xoffset = 4;
        yoffset = -10;
    } else {
        xoffset = 4;
        yoffset = 10;
    }
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - xoffset, y + yoffset);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + xoffset, y + yoffset);
    ctx.closePath();
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
  	}, 1000, function() {
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
$('#recalibrate').click(function(){
	calibrated=0;
	postershown=0;
	$('#mmode').hide();
        $('#mmodewrap').hide();
        $('#mmodemsg').hide();
        $('#restart').hide();
        $('#save').hide();
	$('#selectline').show();
	$(this).hide();
	$('#calibrateok').show();
	
});

// SCREENSHOT CODE
function appScreenshot(callback,imageFormat) {
     var _this = this;
     this.callback = callback;
     imageFormat = imageFormat || 'image/jpeg';
     
     this.handleStream = (stream) => {
         // console.log('stream',stream);
         // Create hidden video tag
         var video = document.createElement('video');
         video.style.cssText = 'position:absolute;top:-10000px;left:-10000px;';
         // Event connected to stream
         video.onloadedmetadata = function () {
             // Set video ORIGINAL height (screenshot)
             video.style.height = this.videoHeight + 'px'; // videoHeight
             video.style.width = this.videoWidth + 'px'; // videoWidth
 
             // Create canvas
             var canvas = document.createElement('canvas');
             canvas.width = this.videoWidth;
             canvas.height = this.videoHeight;
             var ctx = canvas.getContext('2d');
             // Draw video on canvas
             ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
 
             if (_this.callback) {
                 // Save screenshot to jpg - base64
                 _this.callback(canvas.toDataURL(imageFormat));
             } else {
                 console.log('Need callback!');
             }
 
             // Remove hidden video tag
             video.remove();
             try {
                 // Destroy connect to stream
                 stream.getTracks()[0].stop();
             } catch (e) {}
         }
         video.src = URL.createObjectURL(stream);
         document.body.appendChild(video);
     };
 
     this.handleError = function(e) {
         console.log(e);
     };
 
     desktopCapturer.getSources({types: ['window', 'screen']}, (error, sources) => {
         if (error) throw error;
         // console.log(sources);
         for (let i = 0; i < sources.length; ++i) {
             //console.log(sources);
             // Filter: main screen
             if (sources[i].name === document.title) {
                 navigator.webkitGetUserMedia({
                     audio: false,
                     video: {
                         mandatory: {
                             chromeMediaSource: 'desktop',
                             chromeMediaSourceId: sources[i].id,
                             minWidth: 1280,
                             maxWidth: 4000,
                             minHeight: 720,
                             maxHeight: 4000
                         }
                     }
                 }, this.handleStream, this.handleError);
                 return
             }
         }
     });
 }
function decodeBase64Image(dataString) {
  var matches = dataString.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/),
    response = {};

  if (matches.length !== 3) {
    return new Error('Invalid input string');
  }

  response.type = matches[1];
  response.data = new Buffer(matches[2], 'base64');

  return response;
}

$('#save').click(function(){
	appScreenshot(function(base64data){
                    // Draw image in the img tag
                    //document.getElementById("my-preview").setAttribute("src", base64data);
			//fs.writeFile('~/Desktop/sreencap.png', imageBuffer.data, function(err) {
			//	console.log(err);
			//});
			dialog.showSaveDialog({
    				title: 'Save M.mode.ify with measurements',
    				defaultPath: '~/Desktop/'+fileonly+'.mmode.png'
  			}, function (fileName) {
       				if (fileName === undefined){
            				console.log("You didn't save the file");
            				return;
       				}
        			//fs.createReadStream(workdir+'/mmode.png').pipe(fs.createWriteStream(fileName));
				//var offset=$('#mmode').offset();
				//console.log("left: "+offset.left+" top: "+offset.top);
				var imageBuffer = decodeBase64Image(base64data);
                        	var offset=$('#mmode').offset();
				//SAVE TEMP FILE
				var tempimage=workdir+'/temp.mm.meas.png';
				var tempimage2=workdir+'/temp.mm.meas.concat.png';
				fs.writeFile(tempimage,imageBuffer.data, function(err) {
                                      //console.log(err);
                                //});
                        	//cropscreenshot(imageBuffer, offset.left, offset.top, mmodewidth, mmodeheight);
				var xoff=offset.left+250;
				var yoff=offset.top+25;
				var croptext=mmodewidth+'x'+mmodeheight+'+'+xoff+'+'+yoff;
				//console.log(croptext);
				var filearr=fileName.toLowerCase().split('.');
        			var ext=filearr.pop();
        			if(ext!='png'){
                			console.log('ext='+ext+',adding png');
                			fileName=fileName+'.png';
				}
				spawnsync(magickpath, ['convert','-crop', croptext,  tempimage, tempimage2]);
				spawnsync(magickpath, ['convert', '-gravity', 'center', '-background', 'black', '-interlace', 'Line', '', '-quality', '100%', '-append', '-trim', '-fuzz', '10%', '+repage', tempimage2, workdir+'/poster.png', fileName]);
				//console.log(magickpath+' convert '+' -crop '+ croptext +' '+tempimage+' '+fileName);
				});
				//fs.createReadStream(tempimage).pipe(fs.createWriteStream(fileName));
				/*fs.writeFile(fileName,imageBuffer.dat, function(err) {
                        	      console.log(err);
                        	});
				*/
        		});
                },'image/png');
});


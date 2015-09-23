var router = require('express').Router();
var request = require('request');

var videoqueue = [];

var currentVideo = false;

module.exports= function(io){

  function playNextSong(){
    var now = new Date().getTime();
    if(videoqueue.length>0){
      var newguy = videoqueue.shift();
      currentVideo = {Info: newguy, StartTime:now, EndTime: now+newguy.Duration};
      io.emit('queue_updated', videoqueue);
    }
  }

  function getTimeElapsed(){
    var now = new Date().getTime();
    if(currentVideo && now <= currentVideo.EndTime){
      return Math.ceil((now - currentVideo.StartTime)/1000.0);
    }
    currentVideo = false;
    playNextSong();
    return 0;
  }

  io.on('connect', function(socket){
      var elapsed = getTimeElapsed();
      io.sockets.emit('join', {videoQueue:videoqueue, Info:currentVideo.Info, startSeconds: elapsed});
  });

  router.get('/search/:query', function(req, res){
    var host = "https://www.googleapis.com/youtube/v3/search?part=id,snippet&type=video&q=";
    var req_string = host + req.params.query+"&key="+global.config.Keys.YoutubeAPI;
    request(req_string, function(err, response, body){
      if(err){
        return res.send({Success:false, Error: err});
      }
      else{
        var body_obj = JSON.parse(body);
        return res.send({Success:true, Videos:body_obj.items});
      }
    });
  });

  router.post('/queue/', function(req, res){
    var videoinfo = req.body;
    if(!videoinfo){
      return res.send({Success:false, Error: "No video info included"});
    }
    var id = videoinfo['id'].videoId;
    var qstring = "https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id="+id+"&key="+global.config.Keys.YoutubeAPI;
    request(qstring, function(err, response, body){
      if(err){
        return res.send({Success:false, Error: err});
      }
      else{
        var body_obj = JSON.parse(body);
        var duration = body_obj.items[0].contentDetails.duration;
        var durationparts = duration.replace(/P(\d+D)?T(\d+H)?(\d+M)?(\d+S)/i, "$1, $2, $3, $4").split(/\s*,\s*/i);
        var durationmillis = 0;
        var mults = [1000, 60000, 60*60000, 24*60*60000];
        for(var i=durationparts.length-1; i>=0; i--){
          durationmillis += parseInt(durationparts[i].substring(0,durationparts[i].length-1)*mults[3-i]);
        }
        videoinfo.Duration = durationmillis;
        videoqueue.push(videoinfo);
        if(!currentVideo){
          playNextSong();
        }
        else{
          io.sockets.emit('queue_updated', videoqueue);
        }
        return res.send({Success:true});
      }
    });
  });

  router.get('/songend', function(req,res){
    var elapsed = getTimeElapsed();
    if(elapsed == 0){
      io.sockets.emit('song_start', currentVideo);
    }
    return res.send({Success:true});
  });

  return router;
}

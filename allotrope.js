var async = require('async');
var app = require('http').createServer(handler);
var io = require('socket.io').listen(app);
var fs = require('fs');
var url = require('url');
var config = require('./config');
var path = require("path");
var jsonrrd = require('./json-rrd.js')
var mongodb = require('mongodb');
var static = require('node-static');
var db = new mongodb.Db(config.mongo.dbname, new mongodb.Server(config.mongo.host, config.mongo.port, {
    'auto_reconnect': true
}), {
    journal: true
});

io.enable('browser client minification');  // send minified client
io.enable('browser client etag');          // apply etag caching logic based on version number
io.enable('browser client gzip');          // gzip the file
io.set('log level', 1);                    // reduce logging

var fileServer = new static.Server('./');

// db open START
db.open(function (err, db) {
    if (db) {

        db.ensureIndex('s', 'hash', {
            'unique': false
        }, function (err, name) {
            if (err) {
                console.log('ensureIndex error: ',err)
            }
        });
        db.ensureIndex('d', 'hash', {
            'unique': false
        }, function (err, name) {
            if (err) {
                console.log('ensureIndex error: ',err)
            }
        });
        app.listen(config.webport);

    } else {
        console.log('db error: '+err);
    }
});

function handler(req, res) {
    var urlp = url.parse(req.url, true);

    if (urlp.pathname == '/update' && req.method == 'GET') {
        console.log('update request: ' + urlp.path);

        // update request, check key and process
        if (urlp.query.key != config.key || urlp.query.key == undefined) {
            // incorrect key
            console.log('incorrect key');
            res.writeHead(500);
            return res.end('incorrect key');
        } else {
            // correct key
            console.log('correct key '+urlp.query);

            if (urlp.query.hash == undefined || urlp.query.data == undefined || urlp.query.title == undefined || urlp.query.color == undefined || urlp.query.hash == null || urlp.query.data == null || urlp.query.title == null || urlp.query.color == null) {
                // need all this
                res.writeHead(500);
                return res.end('all 4 GET fields; hash, data, title, and color must have data');
            } else {

                // data point to float
                urlp.query.data = parseFloat(urlp.query.data);

                var ts = Math.round((new Date()).getTime() / 1000);
                var p = {
                    hash: urlp.query.hash,
                    data: urlp.query.data,
                    title: urlp.query.title,
                    color: urlp.query.color,
                    ts: ts
                };
                if (Number(urlp.query.alert) == 1) {
                    p.alert = true;
                }
                if (urlp.query.graph) {
                    p.graph = urlp.query.graph;
                }

                // write to db
                db.collection('s', function (err, collection) {
                    collection.update({
                        'hash': urlp.query.hash
                    }, {
                        '$set': p
                    }, {
                        'upsert': true
                    }, function (err, docs) {
                        console.log('error writing to s: '+err);
                    });
                });

                if (urlp.query.graph) {
                    // rrd update
                    p.graph = urlp.query.graph;
                    db.collection('d', function (err, collection) {
                        collection.find({
                            'hash': urlp.query.hash
                        }).toArray(function (err, docs) {
                            if (docs.length > 0) {
                                var d = docs[0].d;
                            } else {
                                var d = {};
                            }
                            if (urlp.query.graph == 'g') {
                                d = jsonrrd.update(5 * 60, 24 * 60 / 5, 'GAUGE', [urlp.query.data], d);
                            } else if (urlp.query.graph == 'c') {
                                d = jsonrrd.update(5 * 60, 24 * 60 / 5, 'COUNTER', [urlp.query.data], d);
                            }

                            // add d to p
                            p.gdata = jsonrrd.fetch(5 * 60, 24 * 60 / 5, d);

                            // update any dashboards
                            io.sockets.emit('update', p);

                            // send http response
                            res.writeHead(200);
                            res.end('success');

                            collection.update({
                                'hash': urlp.query.hash
                            }, {
                                '$set': {
                                    'hash': urlp.query.hash,
                                    'd': d
                                }
                            }, {
                                'safe': false,
                                'upsert': true
                            }, function (err, objects) {});

                        });
                    });

                } else {
                    // non rrd update

                    // update any dashboards
                    io.sockets.emit('update', p);
                    
                    // send http response
                    res.writeHead(200);
                    res.end('success');

                }
            }
        }

    } else {
        console.log('file request: ' + urlp.path);

        // give dashboard
        fileServer.serve(req, res, function (err, result) {
            if (err) console.log('fileServer error: ',err);
        });

    }

}

io.sockets.on('connection', function (socket) {

    // new authed connection, send loginValid to client
    socket.emit('loginValid', {});

    // get all from s
    db.collection('s', function (err, collection) {
        collection.find({}).toArray(function (err, docs) {
            for (i = 0; i < docs.length; i++) {
                if (docs[i].graph) {
                    sendWithGraph(socket, db, docs[i]);
                } else {
                    // no graph, no need to send 
                    socket.emit('update', docs[i]);
                }
            }
        });
    });

    socket.on('deleteOne', function (data) {
        // delete a hash
        console.log('removing '+data.hash);

        db.collection('s', function (err, collection) {
            collection.remove({hash:data.hash}, function (err, result) {
                if (err) console.log('remove error: ',err);
            });
        });

        db.collection('d', function (err, collection) {
            collection.remove({hash:data.hash}, function (err, result) {
                if (err) console.log('remove error: ',err);
            });
        });
    });

    socket.on('graph', function (data) {
        // return graph for hash
        console.log('socket graph '+data);
    });

});

io.set('authorization', function (handshakeData, accept) {

    console.log('dashboard login ' + handshakeData.query.key);
    if (handshakeData.query.key == config.key) {
        accept(null, true);
    } else {
        accept('incorrect key', false);
    }

});

var sendWithGraph = function (socket, db, doc) {
    db.collection('d', function (err, collection) {
        collection.find({
            'hash': doc.hash
        }).toArray(function (err, docs) {
            doc.gdata = jsonrrd.fetch(5 * 60, 24 * 60 / 5, docs[0].d);
            socket.emit('update', doc);
        });
    });
};

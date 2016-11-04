'use strict';

var   Q = require('q'),
  path = require('path'),
  ServerEngine = require('./engine');

var mongoose = require('mongoose')

/* 'hidden methods' of Meanio.prototype */
function serveReady(engine,callback){
  engine.endBootstrap(callback.bind(null,this));
}

function loadConfig(database) {
  var that = this
  if (!database.connection.models.Package) {
    require('./package')(database);
    var Package = mongoose.model('Package')
    Package.findOne().exec(function(err, d) {
      that.register('config', d && d.settings || {})
    })
  }
}

function serveWithDb(Meanio,callback,database){
  var engine = ServerEngine.produceEngine(this.options.serverengine||this.getConfig().serverengine);
  engine.beginBootstrap(this, database);
  Q.all(this.instanceWaitersQ).done(serveReady.bind(this,engine,callback));
}

function genericServe(Meanio, options, callback) {
  if (this.active){
    callback(this);
    return;
  }
  var that = this
  Meanio.prototype.options = options;
  Meanio.prototype.active = true;
  this.resolve('database', function(database) {
    loadConfig.call(that, database)
   
    that.resolve('config', function(config) {
      console.log('config loaded from db')
      // Meanio.config = config
      serveWithDb.call(that, Meanio, callback, database, config)
    });
  });

}
/* end of 'hidden methods' of Meanio.prototype */

function onInstance(Meanio,meanioinstance,defer){
  Meanio.prototype.serve = genericServe.bind(meanioinstance,Meanio);
  var middleware = {
    before: [],
    after: []
  };
  //so tangled up, much spaghetti...
  Meanio.prototype.chainware = {

    add: function(event, weight, func) {
      middleware[event].splice(weight, 0, {
        weight: weight,
        func: func
      });
      middleware[event].join();
      middleware[event].sort(function(a, b) {
        if (a.weight < b.weight) {
          a.next = b.func;
        } else {
          b.next = a.func;
        }
        return (a.weight - b.weight);
      });
    },

    before: function(req, res, next) {
      if (!middleware.before.length) return next();
      this.chain('before', 0, req, res, next);
    },

    after: function(req, res, next) {
      if (!middleware.after.length) return next();
      this.chain('after', 0, req, res, next);
    },

    chain: function(operator, index, req, res, next) {
      var args = [req, res,
        function() {
          if (middleware[operator][index + 1]) {
            this.chain('before', index + 1, req, res, next);
          } else {
            next();
          }
        }
      ];

      middleware[operator][index].func.apply(this, args);
    }
  };

  defer.resolve();
}

function supportServer(Meanio){
  Meanio.onInstance(onInstance.bind(null,Meanio));
}

module.exports = supportServer;

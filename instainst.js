/*!
* instainst
*/

/**
* Module dependencies.
*/

var fs = require('fs');
var path = require('path');
var http = require('http');
var url_module = require('url');
var request = require('request');
var sync_request = require('sync-request');
var cheerio = require('cheerio');
var _ = require('lodash');
var nodemailer = require('nodemailer');
var mkdirp = require('mkdirp');
var jade = require('jade');
var Q = require('q');

/**
 * Instainst constructor.
 *
 * @param {Object} configuration options
 * @api public
 */

function Inst (options) {
    // init cookie jar so we store cookies to be able to login
    this.jar = request.jar();
    
    this.formAttributes = {};
    
    this.newEntries = [];
    
    this.categories = options.categories || {};
    this.credentials = options.credentials || {};
    this.recipients = options.recipients || {};
    this.mailercredentials = options.mailercredentials || {};
}

/**
 * run
 * 
 * Will execute all steps needed to complete retrieval of dagssedler
 * 
 * @api public
 */

Inst.prototype.run = function () {
    this.newEntries = [];
    
    Q.fcall( this._getLoginPage.bind(this) )
        .then( this._collectFormAttributes.bind(this) )
        .then( this.login.bind(this) )
        .then( this._redirect.bind(this) )
        .then( this.getCategoryPages.bind(this) )
        .then( this._parseCategoryPages.bind(this) )
        .then( this._writeFiles.bind(this) )
        .then( this._sendMail.bind(this) )
        .done(function () {
            console.log(
                _.template('Instainst session completed. <%= entries %> new <%= pluralize %> was retrieved.')({ entries : this.newEntries.length, pluralize : this.newEntries.length === 1 ? 'entry' : 'entries' })
            );
        }.bind(this) );
};

/**
 * _getLoginPage
 * 
 * We need to get form parameter values, to be able to successfully 
 * post a correct payload to the login form. We'll retrieve the page body here.
 * 
 * @api private
 */

Inst.prototype._getLoginPage = function () {
    var url = 'https://rk.inst.dk/Login.aspx?ReturnUrl=%2fUser%2fEntryPoint.aspx';
    var deferred = Q.defer();
    
    request({ url: url }, function (err, res, body) {
        deferred.resolve({ res : res, body : body });
    });
    
    return deferred.promise;
};

/**
 * _collectFormAttributes
 * 
 * We need to get form parameter values, to be able to successfully 
 * post a correct payload to the login form. We'll retrieve the actual values here.
 * 
 * @param {promise} Resolved promise from getLoginPage
 * @api private
 */

Inst.prototype._collectFormAttributes = function (promise) {
    var $ = cheerio.load(promise.body);
    
    this.formAttributes = {
        '__VIEWSTATE'           : $('input[name="__VIEWSTATE"]').val(),
        '__VIEWSTATEGENERATOR'  : $('input[name="__VIEWSTATEGENERATOR"]').val(),
        '__EVENTVALIDATION'     : $('input[name="__EVENTVALIDATION"]').val()
    };
};

/**
 * login
 * 
 * Will execute the actual login request
 * 
 * @api public
 */

Inst.prototype.login = function () {
    var url = 'https://rk.inst.dk/Login.aspx?ReturnUrl=%2fUser%2fEntryPoint.aspx';
    var deferred = Q.defer();
    
    request.post({
        url : url,
        jar: this.jar,
      	form : {
      	  '__VIEWSTATE'                                     :   this.formAttributes.__VIEWSTATE,
      	  '__VIEWSTATEGENERATOR'                            :   this.formAttributes.__VIEWSTATEGENERATOR,
      	  '__EVENTVALIDATION'                               :   this.formAttributes.__EVENTVALIDATION,
      	  'ctl00$ctl00$Content$Content$_Login$UserName'     :   this.credentials.username,
          'ctl00$ctl00$Content$Content$_Login$Password'     :   this.credentials.password,
          'ctl00$ctl00$Content$Content$_Login$LoginButton'  :   'Log ind'
      	}
    }, function (err, res, body) {
        deferred.resolve({ res : res, body : body });
    });
    
    return deferred.promise;
};

/**
 * _redirect
 * 
 * The login procedure needs to make a little roundtrip. We support that
 * behaviour here.
 * 
 * @api private
 */

Inst.prototype._redirect = function () {
    var deferred = Q.defer();
    
    request({
        url : 'https://rk.inst.dk/User/EntryPoint.aspx?Location=IP.B', 
        jar: this.jar
    }, function (err, res, body) {
        deferred.resolve({ res : res, body : body });
    });
    
    return deferred.promise;
};

/**
 * getCategoryPages
 * 
 * So we've logged in, and we'd like to take a look at each category page.
 * We'll do the interations here...
 * 
 * @api public
 */

Inst.prototype.getCategoryPages = function () {
    var self = this;
    var deferreds = [];

   _.forEach(this.categories, function(category, label) {
       var listPagePromise = self.getCategoryPage(category, label);
       
       deferreds.push(listPagePromise);
   });
   
   return Q.all(deferreds);
};

/**
 * getCategoryPage
 * 
 * (continued from getCategoryPages) ... and we'll do the actual requests 
 * to each category page here.
 * 
 * @param {String} category ID
 * @param {String} the label of the category
 * @api public
 */

Inst.prototype.getCategoryPage = function (category, label) {
    var deferred = Q.defer();
    
    request({
        url : 'https://rk.inst.dk/Document/CustomList.aspx?Location=FI.B&container='+category+'&s=Title&af=0&archF=0&pg=1&pgSize=1000&ctx=p',
        jar: this.jar
    }, function(err, res, body) {
        deferred.resolve({ category: category, label: label, res : res, body : body });
    });
    
    return deferred.promise;
};

/**
 * _parseCategoryPages
 * 
 * So we've retrieved all the category pages. Now we need to parse
 * them for interesting rows, and for each row, process the entries.
 * 
 * @param {Array} array of resolved promises from getCategoryPages
 * @api private
 */

Inst.prototype._parseCategoryPages = function (promises) {
    var self = this;
    var deferreds = [];
    
    _.forEach(promises, function(promise) {
        var $ = cheerio.load(promise.body);
                    
     	var rows = $('.grid_view tr:not(.pager,.thead)');
     	
     	_.forEach(rows, function(row) {
     	    var parseCategoryPagePromise = self.processEntry(promise.category, promise.label, row);
     	    
     	    if (typeof parseCategoryPagePromise !== 'undefined') {
     	        deferreds.push(parseCategoryPagePromise);
     	    }
     	});
    });
    
    return Q.all(deferreds);
};

/**
 * processEntry
 * 
 * We'll pass in a row with an url to a dagsseddel, and find out
 * if we already have it stored. If now, we'll fetch it and store the
 * contents in our promises array, that will get passed onto writeFiles
 *  
 * @param {String}          category ID
 * @param {String}          the label of the category
 * @param {cheerio Object}  cheerio object of a table row from _parseCategoryPages
 * @api public
 */

Inst.prototype.processEntry = function(category, label, row) {
    var deferred;
    
    var $ = cheerio.load(row);
    
    var date = $('.modified').text();
    
    var url = url_module.resolve('https://rk.inst.dk', $('a').attr('href'));

    var dest = path.join('./entries', label, date);
    var filename = path.join(dest, $('a').attr('title'));
    
    if (!fs.existsSync(dest)) {
        mkdirp.sync(dest);
    }

    if ( !fs.existsSync(filename) ) {
        deferred = Q.defer();
        request({
            url : url,
            jar : this.jar
        }, function (err, res, body) {
            deferred.resolve({ res : res, body : body, filename: filename });
        });
        
        return deferred.promise;
    }
};

/**
 * _writeFiles
 * 
 * We now have the actual HTML for the files that we know
 * we need to store. In here we'll parse out all data from the HTML
 * and send relevant data to our jade compiler to get a nice
 * HTML product which we'll eventually write to the file system.
 *  
 * @param {Array} array of resolved promises from processEntry
 * @api private
 */

Inst.prototype._writeFiles = function (promises) {
    var self = this;
    var deferreds = [];
    
    _.forEach(promises, function(promise) {
        var deferred = Q.defer();
        var $ = cheerio.load(promise.body);
        var paragraphs = $('p');
                
        var filename = promise.filename;
        var txt = '';
        var textblocks = [];
        var convertedImages = [];
        var imageUrls = [];
            
        _.forEach(paragraphs, function(paragraph) {
            var $ = cheerio.load(paragraph);
            var imgs = $('img');
           
            if (imgs.length) {
                _.forEach(imgs, function (img) {
                    var $ = cheerio.load(img);
                    var imageUrl = $('img').attr('src').replace('https:', 'http:');
                    
                    imageUrls.push(imageUrl);
                });
            }else{
                txt = $('p').text().replace(/ /gm,'');
                txt = txt.replace(/(\r\n|\n|\r)/gm,'');
                
                if (txt !== '') {
                    textblocks.push(txt);
                }
            }
        });
        
        // Compile a function
        var fn = jade.compileFile('./mail-tpl.jade', { pretty : true });
    
        // Render the function
        var html = fn({
            textblocks  : textblocks,
            images      : convertedImages,
            imageUrls   : imageUrls
        });
        
        self.newEntries.push({
            subject : filename,
            content : html
        });
        
        deferreds.push(deferred.promise);
       
        fs.writeFile(filename, html, function(err) {
            if(err) {
                console.log(err);
            } else {
                deferred.resolve();
                console.log(filename, 'was saved!');
            }
        });
    });
    
    return Q.all(deferreds);
};

/**
 * _sendMail
 * 
 * Send e-mail with new entries to recipients
 * 
 * @api private
 */
Inst.prototype._sendMail = function () {
    var self = this;

    var transporter = nodemailer.createTransport('smtps://'+this.mailercredentials.email+':'+this.mailercredentials.password+'@smtp.gmail.com');

    _.forEach(this.newEntries, function (entry) {
        transporter.sendMail({
            from: self.mailercredentials.email,
            to: self.recipients.join(),
            subject: entry.subject,
            html: entry.content
        }, function(error, response){
            if(error){
                console.log(error);
            }else{
                console.log('Message sent: ', response.message);
            }
        });
    });  
};

/**
 * Export the constructor.
 */
 
exports = module.exports = Inst;
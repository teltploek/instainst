var Instainst = require('./instainst');

var credentials = {
	username: process.env.username,
	password: process.env.password
};

var inst = new Instainst({ 
    categories : {
        'uglerne'       : 21597,
        'humlebierne'   : 4740,
        'laerkerne'     : 1613
    },
    credentials : {
	    username: process.env.username,
	    password: process.env.password
    }
});

inst.run();
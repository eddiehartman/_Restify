// 20140912 1248
var params = {	url : "", 
				root : "/grc/api",
				username : "", 
				password : "",
				object : "",
				query : "",
				
				refresh : function(connector) {
					for (var pname in this) {
						if (typeof this[pname] !== "function") {
							var control = form.getControl(pname);
							if (control !== null && control.getText() != null) {
								this[pname] = control.getText();
							}	
						}	
					}

					this.root = "/grc/api";

					if (!this.url.toLowerCase().endsWith(this.root.toLowerCase())) {
						this.url = this.url + this.fixPath(this.root);
					}	
//					form.alert("this.url: " + this.url + "\nthis.root: " + this.root)
				},
				
				apply : function(http) {
					for (var pname in this) {
						if (typeof this[pname] !== "function") {
							http.setParam(pname, this[pname]);
						}	
					}
				},

				fixPath : function(path) {
					if (!path.startsWith("/")) {
						path = "/" + path;
					}
					return path;
				}
			}


function getCertificate () {
	form.setWaitCursor();
	try {
		var msg = com.ibm.di.security.GetSSLCertificate.installCertificateFrom(url, 443);
	} finally {
		form.setNormalCursor();
	}
	form.alert(msg);
}

function getTypes() {
	params.refresh();
	params.apply(http);
	
	form.getClass();
	var combo = form.getControl("object");
	combo.removeAll();

	var reply = makeRequest({"verb" : "GET", 
							 "url" : "/types", 
							 "ctype" : "application/json", 
							 "where" : "selectEnries"});

	if (typeof reply.length !== "undefined") {						 
		var arr = new java.util.ArrayList();

		arr.add("file (word, excel, etc)");
		for (var i = 0; i < reply.length; i++) {
			arr.add(reply[i].name);
		}
			
		arr = arr.toArray();
		java.util.Arrays.sort(arr);
	
		for (var a in arr) {
			combo.add(a);
		}	
		
		combo.select(0);
	}	
}

function makeRequest(args) {
	var verb = args.verb;		// HTTP method, e.g. GET, POST, PUT, ...
	var url = args.url;		// url for the request. May be partial (only the path & query string params)
	var body = args.body;		// HTTP body to be passed for the request
	var ctype = args.ctype;	// Content-Type of the HTTP body
	var where = args.where;	// where this method is called from - for debugging purposes

	// set default values for missing params/properties
	if (verb == null) { verb = "GET"; } 
	if (url == null) { url = ""; } 
	if (ctype == null) { ctype = "application/json"; }
	if (where == null) { where = ""; } 

	// prepend the base url if not found in the url passed to the function
	if (url.toLowerCase().indexOf(params.url.toLowerCase()) < 0) {
		url = params.url + params.fixPath(url);
	}
	
//	form.alert("url: " + url + "\n\n    params.url: " + params.url);
	
	requestEntry.removeAllAttributes();
	
	if (typeof body !== "undefined" && body !== null && body.trim().length > 0) {
		requestEntry["http.body"] = body;
	}
	
	// set Connector parameters
	http.setParam("method", verb.toUpperCase());
	http.setParam("url", url);

	// prepare the request Entry (used for POST/PUT calls)
	requestEntry["http.Content-Type"] = ctype;
	requestEntry["http.Accept"] = "application/json";
	requestEntry["http.Connection"] = "keep-alive";
	requestEntry["http.remote_user"] = params.username;
	requestEntry["http.remote_pass"] = params.password;

// commented out for now
//
//	requestEntry["http.Accept-Encoding"] = "gzip, deflate";
//	requestEntry["http.Accept-Language"] = "en-US,en;q=0.5";
//	requestEntry["http.User-Agent"] = "IBM Security Directory Integrator";
//	requestEntry["http.Authorization"] = "BASIC " + system.base64Encode(String(user + ":" + password).getBytes());
	
	// add any cookies received on previous calls
	if (cookies.size() > 0) {
//		requestEntry["X-CouchDB-WWW-Authenticate"] = "Cookie"; // TODO
		requestEntry.merge(cookies);
	}	

	// if Detailed Log is enabled then write request details to the log
	if (deBug) {
		logDetails({"msg" : message["Request to"] + " OpenPages", 
					"obj" : requestEntry, 
					"url" : url, 
					"verb" : verb, 
					"ctype" : ctype, 
					"where" : where});
	}

	var retry = 0;
	var maxRetry = 2;
	var retEntry = null;
	
	// this loop makes the actual request. If an SSL handshake error occurs, attempt to retrieve
	// and import the client certificate and inform the user that TDI must be restarted.
	//
	do {
		try {	
			retEntry = http.queryReply(requestEntry);
			
//			form.alert(retEntry.toString())
		} catch (ex) {
			if (ex instanceof javax.net.ssl.SSLHandshakeException) {
				if (retry == 0) {
					getCertificate();
				} else {	
					throwException(message["You must restart the SDI server in order for the imported certificate to be trusted."])
				}
			} else {
				throw ex;
			}	
		}
		
		retry++;
	} while (retEntry === null && retry < maxRetry);
	
	// if Detailed Log is enabled, write reply details to the log
	if (deBug) {
		logDetails({"msg" : message["Response from"] + " OpenPages", 
				    "entry" : retEntry});
	}
	
	verifyResponse(retEntry);
	
	// parse the reply from OpenPages
	var reply = parseReply(retEntry);
	
	return reply;
}

function throwException(msg) {
	throw new java.lang.IllegalArgumentException(msg);
}

function logmsg(lvl, msg) {
	if (typeof lvl === "undefined") { lvl = ""; } 
	if (typeof msg === "undefined") {
		msg = lvl;
		lvl = "INFO";
	}
	
	if (deBug) {
		java.lang.System.out.println(msg);
	}
		
	try {
		connector.logmsg(lvl, msg);
	} catch (ex) {
		main.logmsg(lvl, msg);
	}	
}

function getParam(pname, required) {
	if (typeof required === "undefined") { required = true; }
	var ctrl = form.getControl(pname);
	if (ctrl == null && required) {
		throwException(message["Required parameter not set"] + ": " + pname);
	}
	
	pval = ctrl.getText();
	
	if (pval === null && required) {
		throwException(message["Required parameter not set"] + ": " + pname);
	} 
	
	return pval;
}

function parseReply(replyEntry) {
	var body = replyEntry.getString("http.bodyAsString");
	
	try {
//		if (deBug) logmsg("DEBUG", "body: " + body);
		var jobj = fromJson(body);
		
		// save any cookies passed back	
		var setCookie = replyEntry.getAttribute("http.Set-Cookie");
		if (setCookie !== null) {
			for (var i = 0; i < setCookie.size(); i++) {
				var thisCookie = setCookie.getValue(i);
				var p = thisCookie.indexOf("=");
				if (p > 0) {
					cookies["http." + thisCookie.substring(0,p)] = thisCookie.substring(p+1);
				}
			}	
		}
	} catch (ex) {
		throwException(message["Unable to parse JSON return from"] + " OpenPages - " + ex);
	}	
	
	return jobj;
}

function fixUrl(params) {
	var url = params.url;
	var dbtype = params.dbtype;
	var protocolSpes = "http:";
	var auth = "";
	
	if (url.startsWith("http")) {
		var p = url.indexOf("/");
		if (p > 0) {
			protocolSpes = url.substring(0, p);
			var p2 = url.indexOf("/", p+1);
			if (p2 == (p+1)) {
				url = url.substring(p2+1);
			} else {
				throwException(message["Invalid format for URL parameter"] + ": " + url);
			}
		}
	}

	if (!url.endsWith("/")) {
		return protocolSpes + "//" + auth + url + "/";
	} else {
		return protocolSpes + "//" + auth + url;
	}
}

function logDetails(params) {
	var msg = params.msg;
	var obj = params.obj; 
	var url = params.url;
	var verb = params.verb;
	var ctype = params.ctype; 
	var where = params.where;
	
	if (msg == null) {
		msg = message["Unnamed entry"];
	}

	var s = new java.lang.StringBuffer();
	
	if (where != null) {
		s.append("\n@@@------> (" + where + ") " + msg);
	} else {
		s.append("\n---------> " + msg);
	}
	
	
	if (verb != null) { s.append("   " + verb.toUpperCase()); } 
	if (ctype != null) { s.append("   " + ctype); } 
	if (url != null) { s.append("   " + url); } 
	s.append("\n");

	if (obj != null) {
		if (obj instanceof com.ibm.di.entry.Entry) {	
			var attNames = obj.getAttributeNames();
			for (var a in attNames) {
				if (a.indexOf("http.") >= 0 && 
					!("http.bodyAsString".equalsIgnoreCase(a)
						|| "http.bodyAsBytes".equalsIgnoreCase(a)) ) {
					s += " " + a + ": " + obj[a] + "\n";
				}
			}	
		} else {
			s.append(obj.toString());
		}
	}	
	form.alert(s.toString());
}

function verifyResponse(replyEntry) {
	var respCode = replyEntry.getString("http.responseCode");
	if (!respCode.startsWith("2")) {
		throwException(message["Error from"] 
						+ " OpenPage server - code: " + respCode
						+ "  message: " + replyEntry.getString("http.responseMsg"));
	}
}

function authenticate() {
	var user = getParam("user");
	var password = getParam("password");
	var reply = makeRequest({verb : "POST", 
							 url : "_session", 
							 body : "name=" + user + "&password=" + password, 
							 ctype : "application/x-www-form-urlencoded", 
							 where : "authenticate",
							 authenticating : true});
	authenticated = true;
}
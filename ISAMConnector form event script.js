// 20120329 0919
function write(fname, str) {
    var bw = new java.io.BufferedWriter(new java.io.FileWriter("C:\\temp\\" + fname))
    //	for (var m in obj.getClass().getMethods()) {
    //		bw.write(m)
    //		bw.newLine()
    //	}

    bw.write(str)
    bw.newLine()
    bw.close()
}

function makeCall(useURI, errorMsg, callType) {
    var url
    var user
    var password
    var httpEntry
    var jsonStr
    var json
    var p
    var p2
    var embeddedURI
    var userAndPassword

    user = form.getControl("user").getText()
    password = form.getControl("password").getText()
    url = form.getControl("baseURL").getText()

    p = useURI.indexOf("|<<")
    p2 = useURI.indexOf(">>|")
    if (p > 0 && p2 > 0 && p2 > p) {
        embeddedURI = useURI.substring(p + 3, p2)
        useURI = embeddedURI + useURI.substring(p2 + 3)
    }

    if (useURI.startsWith("/providers//providers"))
        useURI = useURI.substring(11)

    //	p = url.indexOf("//")
    //	url = url.substring(0,p+2) + userAndPassword + url.substring(p+2)

    //	form.alert("baseURL: " + url)
    //	form.alert("useURI: " + useURI)
    //	form.alert("both combined: " + url + useURI)

    http.setParam("url", url + useURI)
    http.setParam("username", user)
    http.setParam("password", password)
    http.initialize(null)
    httpEntry = system.newEntry();
    httpEntry["http.content-type"] = "application/json"
    httpEntry["http.method"] = "GET"
    httpEntry["http.accept"] = "application/json"

    //	form.alert("@@@ making call to " + http.getParam("url") + " with: \n" + httpEntry.toString()) // @@@

    httpEntry = http.queryReply(httpEntry)

    //form.alert(httpEntry)

    if (httpEntry == null)
        throw "Communication error * " + errorMsg + " - url used: "
    url + useURI + " --> return http.body:\n" + jsonStr

    jsonStr = httpEntry.getString("http.bodyAsString")

    //	write("makeCall " + callType + ".txt", "url: " + url // @@@@
    //						+ "\nuser: " + user
    //						+ "\npassword: " + password
    //						+ "\npayload:\n" + httpEntry.toString())
    //	form.alert("@@@ " + callType + "\n" + jsonStr)

    if (jsonStr == null)
        throw errorMsg + " (Nothing returned) - url used: "
    http.getParam("url") + " --> return http.body:\n" + jsonStr

    //	eval("json=" + jsonStr)
    try {
        json = fromJson(jsonStr)
    } catch (ex) {
        throw errorMsg + " - Error parsing JSON received: " + ex + "   JSON: " + jsonStr
    }

    if (typeof(json) == "undefined" || !json || json == null)
        throw errorMsg + "(Could not parse) - url used: "
    http.getParam("url") + " --> return http.body:\n" + jsonStr

    return json
}

function updateDropdown(uri, controlName, propertyName, errorMsg) {
    var json
    var uri
    var combo = ""
    var i
    var p
    var val
    var label
    var arr

    json = makeCall(uri, errorMsg, controlName)

    if (!json)
        return

    form.getClass()
    combo = form.getControl(controlName)
    combo.removeAll()

    if (!json.items) {
        combo.add(json[propertyName])
    } else {
        arr = new java.util.ArrayList()
        for (i = 0; i < json.items.length; i++) {
            p = json.items[i]
            label = p["label"]
            if (typeof(label) == "undefined")
                val = p[propertyName]
            else
                val = label + " |<<" + p[propertyName] + ">>|"
            //			form.alert(">> provider: " + p.uri)
            arr.add(val)
        }

        arr = arr.toArray()
        java.util.Arrays.sort(arr)

        for (var a in arr) {
            combo.add(a)
        }
    }

    combo.select(0)
}

function getProviders() {
    updateDropdown("/providers", "provider", "uri", "No Providers returned")
}

function getDatasources() {
    updateDropdown(form.getControl("provider").getText() + "/datasources",
        "datasource", "uri", "No Datasources returned")
}

function getDatasets() {
    updateDropdown(form.getControl("datasource").getText() + "/datasets",
        "dataset", "uri", "No Datasets returned")
}


function getParams() {
    var params = makeCall(form.getControl("dataset").getText() + "/parameters",
        "No Dataset parameters returned",
        "getParams")
    var formconfig = form.getFormConfig()
    var fs
    var p
    var fic

    // create dataset section
    if (formconfig.getSection("Dataset") == null) {
        throw "Connection form is missing the 'Dataset' section!"
        //		fs = new com.ibm.di.config.base.FormSectionImpl()
        //		fs.setName("Dataset")
        //		fs.setTitle("Provider Dataset")
        //		formconfig.addSection(fs)
    }

    // get fs as section handle
    fs = formconfig.getSection("Dataset");

    // remove all dataset section fields
    for (str in fs.getNames()) {
        formconfig.removeFormItem(str);
    }

    // remove all params from section dataset
    fs.getNames().removeAllElements();


    // create a new param_* field and add it to Dataset section

    for (var i = 0; i < params.items.length; i++) {
        if (params.items[i].hidden != "true") {
            p = params.items[i]
            fic = formconfig.newFormItem(p.id)
            fic.setLabel(p.label)
            fic.setSyntax(p.type)
            fic.setToolTip(p.description)
            fic.setRequired(p.required != "false")

            if (("!" + p["default"]) != "!undefined")
                fic.setDefaultValue(p["default"])
            else
                fic.setDefaultValue("")

            fs.getNames().add(fic.getShortName())
        }
    }

    form.resetForm();
    form.initialize();
}
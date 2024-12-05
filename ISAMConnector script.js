// ISAM Script connector
// var version = "20131122 1339"
// var version = "20131209 1039" added Group member attribute handling
// var version = "20140122 1128" added correct handling of secPwdValid to support PTA(default = true) 
// var version = "20140122 1249" added group handling for modEntry
// var version = "20140122 1618" fixed mapping of secAcctValid and secPwdValid - was always true
// var version = "20140124" Extracted messages
// var version = "20140128 1523" fixed bug in terminate that prevented Connect + Read to work in the CE
// var version = "20140129 1117" fixed bug where secPwdValid was being set to false
// var version = "20151222" improved group membership / group member handling
// var version = "20210114" Improved handling of some user attributes RESOLVER = com.ibm.di.server.ResourceHash.getHash("isamconnector") var tamDomain = "Default";
var tamCfgFile = null;
var delFromRegistry = false;
var rgyRegistry = null;
var entityType = "User";
var nameAtt = "principalName";
var list = null;
var searchString = "*";
var MAXRETURN = 0;
var PAGESIZE = 0;
connector.logmsg(RESOLVER.getString("ISAM.VERSION", version))
function CRgyException(message) {
	var ex = {}
	ex.message = message;
	ex.name = "RgyException";
	return ex
}
// SAM Connector initialization;

function initialize() {
	//
	connector.logmsg("initialize()...");
	tamDomain = connector.getParam("tamDomain") || "Default";
	tamCfgFile = connector.getParam("tamCfgFile");
	entityType = connector.getParam("entityType") || "User";
	searchString = connector.getParam("searchString") || "*";
	delFromRegistry = (connector.getParam("delFromRegistry") || true).toString().equalsIgnoreCase("true") if (tamCfgFile == null) {
		throw RESOLVER.getString("ISAM.NO.CONFIG.FILE");
	}
	try {
		if (rgyRegistry == null) {
			var file = new java.io.File(tamCfgFile);
			rgyRegistry = new com.tivoli.pd.rgy.ldap.LdapRgyRegistryFactory.getRgyRegistryInstance(file.toURI().toURL(), null);
			connector.debug(RESOLVER.getString("ISAM.INIT.SUCCESS"))
		}
	} catch (e) {
		connector.logError(RESOLVER.getString("ISAM.INIT.FAIL", e)) throw e;
	}
	if (entityType == "User") {
		nameAtt = "principalName";
	} else {
		nameAtt = "cn";
	}
}

function selectEntries(srch) {
	srch = srch || searchString;
	//
	connector.logmsg("selectEntries()...");
	if (entityType == "User") {
		list = rgyRegistry.listUsers(tamDomain, srch, MAXRETURN, PAGESIZE);
	} else {
		list = rgyRegistry.listGroups(tamDomain, srch, MAXRETURN, PAGESIZE);
	}
}

function getNextEntry(entrylist) {
	entrylist = entrylist || list;
	entry.removeAllAttributes();
	//
	connector.logmsg("getNextEntry()...");
	if (!entrylist.hasNext()) {
		result.setStatus(0);
		return;
	}
	var name = entrylist.next();
	if (entityType == "User") {
		var entity = rgyRegistry.getUser(tamDomain, name);
	} else {
		var entity = rgyRegistry.getGroup(tamDomain, name);
	}
	var attrlist = entity.attributeNameIterator();
	while (attrlist.hasNext()) {
		var attrname = attrlist.next();
		var values = entity.getAttributeValues(attrname);
		var attr = system.newAttribute(attrname);
		for (var i = 0; i < values.length; i++) {
			attr.addValue(values[i]);
		}
		entry[attrname] = attr;
	}
	//
	Add memberOf / member attributes on retrieval
	var attrname;
	var values;
	if (entityType == "User") {
		attrname = "memberOf";
		values = entity.listGroups().toArray();
	} else {
		attrname = "member";
		values = entity.listMemberIds().toArray();
	}
	var attr = entry.newAttribute(attrname);
	for (var i = 0; i < values.length; i++) {
		attr.addValue(values[i]);
	}
}

function boolValue(attr, defValue) {
	if (typeof(defValue == "undefined")) {
		defValue = true;
	}
	if (typeof(attr) == "undefined" || attr === null) {
		attr = defValue;
	}
	attr = String(attr).trim();
	if ("false".equalsIgnoreCase(attr) || "no".equalsIgnoreCase(attr)) {
		return com.tivoli.pd.rgy.RgyAttributes.BOOL_FALSE_VALUE;
	} else {
		return com.tivoli.pd.rgy.RgyAttributes.BOOL_TRUE_VALUE;
	}
} /** * Imports TDS user to TAM. * * @param userdn LDAP DN * @param username Login ID in TAM * @param group TAM group id. * @return true if success, false if errors. */
function importUser(userdn, username, groups, secAcctValid, secPwdValid) {
	var user = rgyRegistry.getNativeUser(tamDomain, userdn);
	if (user == null) {
		throw CRgyException(RESOLVER.getString("ISAM.USER.DOES.NOT.EXIST", userdn))
	}
	var attrs = rgyRegistry.newRgyAttributes();
	attrs.putAttribute(com.tivoli.pd.rgy.RgyAttributes.SEC_ACCT_VALID_NAME, boolValue(secAcctValid, true));
	attrs.putAttribute(com.tivoli.pd.rgy.RgyAttributes.SEC_PWD_VALID_NAME, boolValue(secPwdValid, true));
	attrs.putAttribute(com.tivoli.pd.rgy.RgyAttributes.SEC_DN_NAME, userdn);
	user.importNativeUser(username, attrs, null);
	connector.debug(RESOLVER.getString("ISAM.USER.IMPORT.SUCCESS", username)) if (groups) {
		manageGroupMembers(username, groups)
	}
} /** * Imports TDS Group to TAM. * * @param Groupdn LDAP DN * @param GroupName in TAM * @return true if success, false if errors. */
function importGroup(groupdn, groupname, member) {
	var grp = rgyRegistry.getNativeGroup(tamDomain, groupdn);
	if (grp == null) {
		throw CRgyException(RESOLVER.getString("ISAM.GROUP.DOES.NOT.EXIST", groupdn))
	}
	attrs = rgyRegistry.newRgyAttributes();
	attrs.putAttribute(com.tivoli.pd.rgy.RgyAttributes.SEC_DN_NAME, groupdn);
	grp.importNativeGroup(groupname, attrs);
	connector.debug(RESOLVER.getString("ISAM.GROUP.IMPORT.SUCCESS", groupname));
	if (typeof(member) != "undefined" && member != null) {
		manageMembership(name, member)
	}
} /** * Deletes user from SAM and registry if necessary * @param userId * @param delFromRegistry true if delete from SDS, false delete only SAM */
function deleteUser(userId, delFromRegistry) {
	/* @@TODO removing a deleted user from all group memberships 
//
 remove user from all group memberships var list = rgyRegistry.listGroups(tamDomain, "", MAXRETURN, PAGESIZE); var grpName; var grp; while (list.hasNext()) { grpName = list.getNext(); try { grp = rgyRegistry.getGroup(tamDomain, grpName); } catch (ex) { connector.logError(RESOLVER.getString("ISAM.PROBLEM.REMOVING.USER", [userId, grpName, ex]); } } */
	rgyRegistry.deleteUser(tamDomain, userId, delFromRegistry);
} /** * Deletes Group from SAM and registry if necessary * @param groupId * @param delFromRegistry true if delete from SDS, false delete only SAM */
function deleteGroup(groupId, delFromRegistry) {
	rgyRegistry.deleteGroup(tamDomain, groupId, delFromRegistry);
} /** * Adds user to SAM group. NOTE! The group needs to be in SAM. * @param groupId group ID in SAM * @param userId User's ldap id * @return True if success, false if errors */
function manageGroupMembers(userId, members) {
	var grp;
	var userList = new java.util.ArrayList();
	userList.add(userId);
	if (typeof(members) != "undefined" && members != null && members.size() > 0) {
		var modify = members.getOperation().equals("modify");
		for (var i = members.size(); i--;) {
			var groupId = members.getValue(i) var deleteFromGroup = modify && members.getValueOperation(i).equals("delete") try {
				grp = rgyRegistry.getGroup(tamDomain, groupId);
				if (grp === null) {
					throw RESOLVER.getString("ISAM.GROUP.NOT.FOUND", groupId)
				} else if (deleteFromGroup) {
					grp.removeMembers(userList);
				} else {
					grp.addMembers(userList);
				}
			} catch (ex) {
				//
				ignore HPDAA0330E An attribute type or attribute value specified already exists in the entry.if(ex.toString().indexOf("HPDAA0330E") < 0) {
					if (deleteFromGroup) {
						connector.logError(RESOLVER.getString("ISAM.USER.NOT.DELETED.GROUP", [userId, groupId, ex]))
					} else {
						connector.logError(RESOLVER.getString("ISAM.USER.NOT.ADDED.GROUP", [userId, groupId, ex]))
					}
				}
			}
		}
	}
} /** * This method gets a member attribute value and determines if it is * an LDAP DN. If so, then it extracts the RDN value and returns this */
function fixPrincipalName(name) {
	if (typeof(name) == "undefined" || name == null) {
		return ""
	}
	try {
		rdns = new javax.naming.ldap.LdapName(name).getRdns();
		name = rdns.get(rdns.size() - 1).getValue();
	} catch (ex) {
		//
		not a DN
	}
	return name;
} /** * Adds users found in member attribute to SAM group. * NOTE: This Connector handles value operation tags. * @param groupId group ID in SAM * @param userId User's ldap id * @return True if success, false if errors */
function manageMembership(groupId, member) {
	var grp;
	var userList = new java.util.ArrayList();
	var size;
	if (typeof(member) == "undefined" || member === null) {
		return;
	}
	size = member.size();
	grp = rgyRegistry.getGroup(tamDomain, groupId);
	if (grp === null) {
		throw RESOLVER.getString("ISAM.GROUP.NOT.FOUND", groupId)
	}
	for (var i = 0; i < size; i++) {
		try {
			userList.clear();
			userList.add(fixPrincipalName(member.getValue(i)));
			if ("delete".equals(member.getValueOperation(i))) {
				grp.removeMembers(userList);
			} else {
				grp.addMembers(userList);
			}
		} catch (ex) {
			if ("delete".equals(member.getValueOperation(i))) {
				connector.logError(RESOLVER.getString("ISAM.USER.NOT.DELETED.GROUP", [userList.get(0), groupId, ex]))
			} else {
				connector.logError(RESOLVER.getString("ISAM.USER.NOT.ADDED.GROUP", [userList.get(0), groupId, ex]))
			}
		}
	}
}

function terminate() {
	//
	connector.logmsg("terminate()...");
	if (rgyRegistry != null) {
		rgyRegistry.close();
	}
	currententry = null;
	list = null;
	rgyRegistry = null;
}

function createUser(mDN, mCN, mSN, mPassword, mDesc, secAcctValid, secPwdValid, groups) {
	var pwdValid = typeof(mPassword) != "undefined" && mPassword != null && mPassword.trim().length > 0;
	var pwdBytes = null;
	if (pwdValid) {
		pwdBytes = mPassword.trim().split('');
	}
	mDesc = mDesc || "";
	var attrs = rgyRegistry.newRgyAttributes();
	attrs.putAttribute(com.tivoli.pd.rgy.RgyAttributes.SEC_DN_NAME, mDN);
	attrs.putAttribute(com.tivoli.pd.rgy.RgyAttributes.COMMON_NAME_NAME, mCN);
	attrs.putAttribute(com.tivoli.pd.rgy.RgyAttributes.SURNAME_NAME, mSN);
	attrs.putAttribute(com.tivoli.pd.rgy.RgyAttributes.DESCRIPTION_NAME, mDesc);
	attrs.putAttribute(com.tivoli.pd.rgy.RgyAttributes.SEC_ACCT_VALID_NAME, boolValue(secAcctValid, true));
	attrs.putAttribute(com.tivoli.pd.rgy.RgyAttributes.SEC_PWD_VALID_NAME, boolValue(secPwdValid, true));
	var entity = rgyRegistry.createUser(tamDomain, mCN, mDN, pwdBytes, false, attrs, null);
	manageGroupMembers(mCN, groups);
	return entity;
}

function createGroup(mGroupDN, mCN, mDesc, mMember) {
	var attrs = rgyRegistry.newRgyAttributes();
	mDesc = mDesc || "";
	//
	attrs.putAttribute(com.tivoli.pd.rgy.RgyAttributes.SEC_ACCT_VALID_NAME, boolValue(secAcctValid));
	attrs.putAttribute(com.tivoli.pd.rgy.RgyAttributes.SEC_DN_NAME, mGroupDN);
	attrs.putAttribute(com.tivoli.pd.rgy.RgyAttributes.COMMON_NAME_NAME, mCN);
	attrs.putAttribute(com.tivoli.pd.rgy.RgyAttributes.DESCRIPTION_NAME, mDesc);
	rgyRegistry.createGroup(tamDomain, mCN, mGroupDN, attrs);
	if (typeof(mMember) != "undefined" && mMember != null) {
		manageMembership(mCN, mMember)
	}
}

function putEntry() {
	var doCreate = false;
	var dn = entry.getString("secDN");
	var name = entry.getString(nameAtt) var cn = entry.getString("cn");
	var sn = entry.getString("sn") var desc = entry.getString("description");
	var groups = entry.getAttribute("memberOf");
	var member = entry.getAttribute("member");
	if (member === null) {
		member = entry.getAttribute("uniqueMember");
	}
	var secPwdValid = entry.getString("secPwdValid");
	var secAcctValid = entry.getString("secAcctValid");
	var userPassword = entry.getString("userPassword");
	var pwdValid = userPassword != null && userPassword.trim().length > 0;
	var pwdBytes = null;
	var entity = null;
	if (pwdValid) {
		pwdBytes = userPassword.trim().split('');
	}
	if (dn == null) {
		throw RESOLVER.getString("ISAM.ATTRIBUTE.MISSING", "secDN");
	}
	if (name == null) {
		throw RESOLVER.getString("ISAM.ATTRIBUTE.MISSING", nameAtt);
	}
	try {
		if (entityType == "User") {
			importUser(dn, name, groups, secAcctValid, secPwdValid);
			entity = rgyRegistry.getUser(tamDomain, name);
			if (entity != null) {
				if (pwdValid) {
					entity.setPassword(pwdBytes);
				}
				if (sn != null) {
					entity.attributeReplace(com.tivoli.pd.rgy.RgyAttributes.SURNAME_NAME, sn);
				}
				if (desc != null) {
					entity.attributeReplace(com.tivoli.pd.rgy.RgyAttributes.DESCRIPTION_NAME, desc);
				}
			}
		} else {
			importGroup(dn, name, member);
		}
	} catch (e) {
		//
		This Check is
		for
		if User / Group is NOT present in TDS
		if ((e.message.indexOf("CTGDIH404E") >= 0) || (e.message.indexOf("CTGDIH406E") >= 0) || (e.message.indexOf("No Such Object") >= 0)) {
			doCreate = true;
		} else {
			throw e;
		}
	}
	if (doCreate == true) {
		if (entityType == "User") {
			if (sn == null) {
				throw RESOLVER.getString("ISAM.ATTRIBUTE.MISSING", "sn");
			}
			entity = createUser(dn, name, sn, userPassword, desc, secAcctValid, secPwdValid, groups);
		} else {
			//
			Group create createGroup(dn, name, desc, member);
		}
	}
	if (entityType == "User" && entity != null) {
		if (cn != null && cn != name) {
			entity.attributeReplace(com.tivoli.pd.rgy.RgyAttributes.COMMON_NAME_NAME, cn);
		}
		var mail = entry.getString("mail") if (mail != null) {
			entity.attributeReplace("mail", mail);
		}
	}
}

function modEntry() {
	var name = old.getString(nameAtt);
	var sn = entry.getString("sn") var desc = entry.getString("description");
	var secPwdValid = entry.getString("secPwdValid");
	var secAcctValid = entry.getString("secAcctValid");
	var userPassword = entry.getString("userPassword");
	var groups = entry.getAttribute("memberOf");
	var member = entry.getAttribute("member");
	if (member === null) {
		member = entry.getAttribute("uniqueMember");
	}
	var pwdValid = typeof(userPassword) != "undefined" && userPassword != null && userPassword.trim().length > 0;
	var entity
	var pwdBytes = null;
	if (pwdValid) {
		pwdBytes = userPassword.trim().split('');
	}
	if (name == null) {
		throw RESOLVER.getString("ISAM.NO.ENTRY.MODIFY");
	}
	if (entityType == "User") {
		entity = rgyRegistry.getUser(tamDomain, name);
		if (entity) {
			entity.attributeReplace(com.tivoli.pd.rgy.RgyAttributes.SEC_PWD_VALID_NAME, boolValue(secPwdValid, true));
			entity.attributeReplace(com.tivoli.pd.rgy.RgyAttributes.SEC_ACCT_VALID_NAME, boolValue(secAcctValid, true));
			if (desc != null) {
				entity.attributeReplace(com.tivoli.pd.rgy.RgyAttributes.DESCRIPTION_NAME, desc);
			}
			if (sn != null) {
				entity.attributeReplace(com.tivoli.pd.rgy.RgyAttributes.SURNAME_NAME, sn);
			}
			var cn = entry.getString("cn") if (cn != null && cn != name) {
				entity.attributeReplace(com.tivoli.pd.rgy.RgyAttributes.COMMON_NAME_NAME, cn);
			}
			var mail = entry.getString("mail") if (mail != null) {
				entity.attributeReplace("mail", mail);
			}
			if (pwdValid) {
				entity.setPassword(pwdBytes);
			}
			if (typeof(groups) != "undefined" && groups != null) {
				if (groups.getOperation() == "modify") {
					manageGroupMembers(name, groups)
				} else {
					//
					corrected support
					for groups - franzw @dk.ibm.com
					var oldGroups = old.getAttribute("memberOf");
					if (oldGroups == null) return;
					var resGroups = system.newAttribute("memberOf");
					//
					Remove common groups from oldGroups
					for (group in groups.getValues()) {
						if (oldGroups.hasValue(group)) {
							oldGroups.removeValue(group);
						} else {
							//
							add group to resGroups valueop add resGroups.addValue(group, com.ibm.di.entry.AttributeValue.AV_ADD);
						}
					}
					//
					Add groups to be removed to resGroups valueOp delete
					for (group in oldGroups.getValues()) {
						resGroups.addValue(group, com.ibm.di.entry.AttributeValue.AV_DELETE);
					}
					//
					Set the attribute OP to modify resGroups.setOperation("modify");
					//
					Call manageGroupMembers with the groups to be deleted manageGroupMembers(name, resGroups)
					//
					corrected support
					for groups - franzw @dk.ibm.com
				}
			}
		}
	} else {
		//
		replace Attributes
		for Group--only description supported entity = rgyRegistry.getGroup(tamDomain, name);
		if (entity) {
			if (typeof(desc) != "undefined" && desc != null) {
				entity.attributeReplace(com.tivoli.pd.rgy.RgyAttributes.DESCRIPTION_NAME, desc);
			}
			if (typeof(member) != "undefined" && member != null) {
				if (member.getOperation() == "modify") {
					manageMembership(name, member)
				} else {
					//
					corrected support
					for membership - franzw @dk.ibm.com
					var oldMember = old.getAttribute("member");
					if (oldMember == null) {
						oldMember = old.getAttribute("uniqueMember");
					}
					if (oldMember == null) return;
					var resMember = system.newAttribute("member");
					//
					Remove common users from oldMembers
					for (user in member.getValues()) {
						if (oldMember.hasValue(user)) {
							oldMember.removeValue(user);
						} else {
							//
							add user to resMembers valueop add resMember.addValue(user, com.ibm.di.entry.AttributeValue.AV_ADD);
						}
					}
					//
					Add user to be removed to resMembers valueOp delete
					for (user in oldMember.getValues()) {
						resMember.addValue(member, com.ibm.di.entry.AttributeValue.AV_DELETE);
					}
					//
					Set the attribute OP to modify resMember.setOperation("modify");
					//
					Call manageGroupMembers with the users to be removed manageMembership(name, resMember)
					//
					corrected support
					for groups - franzw @dk.ibm.com
				}
			}
		}
	}
}

function deleteEntry() {
	if (entry == null || entry.size() == 0) {
		throw RESOLVER.getString("ISAM.NO.ENTRY.DELETE");
	}
	var name = entry.getString(nameAtt);
	if (name == null) {
		throw RESOLVER.getString("ISAM.NO.ENTRY.DELETE.NAME", nameAtt);
	}
	if (entityType == "User") {
		deleteUser(name, delFromRegistry);
	} else {
		deleteGroup(name, delFromRegistry);
	}
}

function findEntry() {
	var finalsearch = null;
	var readEntry
	for (var i = 0; i < search.size(); i++) {
		var attrname = search.getCriteria(i).name.toLowerCase().trim();
		var match = search.getCriteria(i).match;
		var value = search.getCriteria(i).value;
		var negate = search.getCriteria(i).negate;
		if (negate) {
			throw RESOLVER.getString("ISAM.UNSUPPORTED.NEGATE");
		}
		if (!attrname.equalsIgnoreCase(nameAtt)) {
			throw RESOLVER.getString("ISAM.ONLY.SEARCH.NAME", nameAtt);
		}
		var searchString;
		if (match == search.EXACT) {
			searchString = value
		} else if (match == search.INITIAL_STRING) {
			searchString = value + "*"
		} else if (match == search.FINAL_STRING) {
			searchString = "*" + value
		} else if (match == search.SUBSTRING) {
			searchString = "*" + value + "*"
		} else {
			throw RESOLVER.getString("ISAM.UNSUPPORTED.SEARCH.OP");
		}
		selectEntries(searchString);
		var currentsearch = new java.util.HashMap();
		do {
			try {
				getNextEntry(list);
			} catch (e) {
				if (e.message.indexOf("HPDAA0271E") >= 0) {
					//
					entriesNotInLDAPtoDelete.add(value, "") entry.setAttribute(nameAtt, value)
				}
			}
			if (entry.size() > 0) {
				readEntry = system.newEntry() readEntry.merge(entry) currentsearch.put(entry.getString(nameAtt), readEntry);
			}
		} while (entry.size() > 0);
		if (finalsearch == null) {
			finalsearch = currentsearch;
		} else if (search.getType() == search.SEARCH_AND) {
			var keys = finalsearch.keySet().toArray();
			for (var key in keys) {
				if (!currentsearch.containsKey(key)) {
					finalsearch.remove(key);
				}
			}
		} else if (search.getType() == search.SEARCH_OR) {
			var keys = currentsearch.keySet().toArray();
			for (var key in keys) {
				if (!finalsearch.containsKey(key)) {
					finalsearch.put(key, currentsearch.get(key));
				}
			}
		}
	}
	if (finalsearch == null) {
		throw RESOLVER.getString("ISAM.NO.LINK,CRITERIA");
	}
	var keys = finalsearch.keySet().toArray();
	entry.removeAllAttributes();
	if (keys.length == 0) {
		result.setStatus(0);
	} else if (keys.length == 1) {
		result.setStatus(1);
		entry.merge(finalsearch.get(keys[0]));
	} else {
		result.setStatus(0);
		java.util.Arrays.sort(keys);
		for (var i = 0; i < keys.length; i++) {
			connector.addFindEntry(finalsearch.get(keys[i]));
		}
	}
}

function schemaItem(name, sntx) {
	var e = system.newEntry() e.name = name e.setAttribute("syntax", sntx) return e
}

function querySchema() {
	list.add(schemaItem("secDN", "String")) list.add(schemaItem(nameAtt, "String")) if (entityType.equals("User")) {
		list.add(schemaItem("secAcctValid", "Boolean")) list.add(schemaItem("secPwdValid", "Boolean")) list.add(schemaItem("cn", "String")) list.add(schemaItem("mail", "String")) list.add(schemaItem("sn", "String")) list.add(schemaItem("description", "String")) list.add(schemaItem("memberOf", "Multi-valued String")) list.add(schemaItem("userPassword", "String"))
	} else {
		list.add(schemaItem("description", "String")) list.add(schemaItem("member", "Multi-valued String"))
	} result.setStatus(1)
}
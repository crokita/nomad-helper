var needle = require('needle');
var jsonfile = require('jsonfile');
var JSONStream = require('JSONStream');

module.exports = {
	createJob: createJob,
	findJob: findJob,
	deleteJob: deleteJob,
	getAllocations: getAllocations,
	streamLogs: streamLogs
}

//uses service-template to make a JSON nomad job file without anything in TaskGroups
function createJob (jobName) {
	var obj = getJson('job-template');
	obj.Job.ID = jobName;
	obj.Job.Name = jobName;
	return new Template(obj);
}

//find a job in Nomad with the name given. returns a new Template instance if
//a job is found or null if none is found
function findJob (jobName, address, callback) {
	needle.get('http://' + address + '/v1/job/' + jobName, function (err, res) {
		if (err) {
			throw err;
		}
		//if there is a valid object in the body then there is a job running
		if (typeof(res.body) === 'object') {
			callback(new Template(res.body));
		}
		else {
			//no core job
			callback(null);
		}	
	});
}

function deleteJob (jobName, address, callback) {
	needle.delete('http://' + address + '/v1/job/' + jobName, null, function (err, res) {
		callback();
	});
}

//get all allocations for a specific job
function getAllocations (jobName, address, callback) {
	needle.get('http://' + address + '/v1/job/' + jobName + "/allocations", function (err, res) {
		if (err) {
			throw err;
		}
		//value should be an array
		var allocations = res.body;

		//return the allocations with a helper function to get just one property of the array
		callback({
			allocations: allocations,
			getProperty: getProperty
		});
		function getProperty (property) {
			var props = [];
			for (let i = 0; i < allocations.length; i++) {
				props.push(allocations[i][property]);
			}
			return props;
		}
	});
}

//stream the logs from an allocation
function streamLogs (allocationId, taskName, logType, address, callback) {
	var address = 'http://' + address + '/v1/client/fs/logs/' + allocationId;
	//add query parameters
	var data = {
		task: taskName,
		follow: true, //we want a stream
		type: logType
	}
	//pass in {parse:true} because this stream expects formatted JSON
	needle.request('get', address, data, {parse:true})
	.pipe(new JSONStream.parse("Data")) //return full JSON objects and only return the "Data" property back
	.on('data', function (obj) {
		//base 64 encoding. decode it to utf-8 and return the chunk
		var result = new Buffer(obj, 'base64').toString('utf-8');
		callback(result);
	})
}

//function constructor for editing nomad job files easily
function Template (job) {
	this.job = job;
}

//return the job object as you would want it to pass to Nomad
Template.prototype.getJob = function () {
	return this.job;
}

//send the job file to Nomad through the Nomad HTTP API
//needs an http address for Nomad, both the IP and port in ip:port format
Template.prototype.submitJob = function (address, callback) {
	//'this' changes inside async call
	var jobObject = this.getJob();
	jobObjectString = JSON.stringify(jobObject);
	needle.post('http://' + address + '/v1/job/', jobObjectString, function (err, res) {
		if (err) {
			throw err;					
		}
		callback(res.body);
	});
}


//creates a new group with a name, but no tasks
//add it to the job object
Template.prototype.addGroup = function (groupName) {
	//make sure a group with the same name doesn't already exist	
	if (this.findGroup(groupName) !== null) {
		return;
	}
	//add the group
	var obj = getJson('group-template');
	obj.Name = groupName;
	this.getJob().Job.TaskGroups.push(obj);
}

//creates a new bare-bones task with a name
//add it to the job group specified
Template.prototype.addTask = function (groupName, taskName) {
	//add the task. make sure the group of groupName exists first
	let group = this.findGroup(groupName);
	if (group === null) {
		return;
	}
	var obj = getJson('task-template');
	obj.Name = taskName;
	group.Tasks.push(obj);
}

//creates a new bare-bones service with a name
//add it to the job group, and task specified
Template.prototype.addService = function (groupName, taskName, serviceName) {
	//makes sure the task exists first
	let task = this.findTask(groupName, taskName);
	if (task === null) {
		return;
	}
	var obj = getJson('service-template');
	obj.Name = serviceName;
	task.Services.push(obj);
}

//gets the number of instances that should be running
Template.prototype.getCount = function (groupName) {
	let group = this.findGroup(groupName);
	if (group === null) {
		return;
	}
	return group.Count;
}

//sets the number of instances that should be running
Template.prototype.setCount = function (groupName, count) {
	let group = this.findGroup(groupName);
	if (group === null) {
		return;
	}
	group.Count = count;
}

//sets the restart policy of the group
//interval and delay is specified in nanoseconds
Template.prototype.setRestartPolicy = function (groupName, interval, attempts, delay, mode) {
	let group = this.findGroup(groupName);
	if (group === null) {
		return;
	}
	var policyObj = {
		Interval: interval,
		Attempts: attempts,
		Delay: delay,
		Mode: mode
	}
	group.RestartPolicy = policyObj;
}

//sets the docker image you are using for the job. needs a group name and task name
Template.prototype.setImage = function (groupName, taskName, imageName) {
	//makes sure the task exists first
	let task = this.findTask(groupName, taskName);
	if (task === null) {
		return;
	}
	task.Config.image = imageName;
}

//NOTE: assumes there's only one network object in the networks array. doesn't support multiple networks atm
//adds a new port. Must specify if static or dynamic (false or true)
//if static, portNumber is the static port to use for the portName specified
//if dynamic, portNumber is optional and is used as a mapped port (ie. docker mapped ports)
Template.prototype.addPort = function (groupName, taskName, isDynamic, portName, portNumber) {
	//makes sure the task exists first
	let task = this.findTask(groupName, taskName);
	if (task === null) {
		return;
	}
	if (!isDynamic) { //static port
		let networkObj = {
			Label: portName,
			Value: portNumber
		}
		task.Resources.Networks[0].ReservedPorts.push(networkObj);
	}
	else { //dynamic port
		let networkObj = {
			Label: portName,
			Value: 0
		}
		task.Resources.Networks[0].DynamicPorts.push(networkObj);
		//if the portNumber exists, add it as a port mapping
		if (portNumber !== undefined) {
			//make sure port_map exists
			//only have one object in the array that holds all the port maps
			if (!task.Config.port_map) {
				task.Config.port_map = [];
				task.Config.port_map.push({});
			}
			task.Config.port_map[0][portName] = portNumber;
		}
	}
}

//add an environment variable. you can add interpolated strings that Nomad recognizes, too
Template.prototype.addEnv = function (groupName, taskName, key, value) {
	let task = this.findTask(groupName, taskName);
	if (task === null) {
		return;
	}
	task.Env[key] = value;
}

//add a tag to the service. you can add interpolated strings that Nomad recognizes, too
Template.prototype.addTag = function (groupName, taskName, serviceName, tag) {
	let service = this.findService(groupName, taskName, serviceName);
	if (service === null) {
		return;
	}
	service.Tags.push(tag);
}

//add a port label to the service that will be shown by consul
Template.prototype.setPortLabel = function (groupName, taskName, serviceName, portLabel) {
	let service = this.findService(groupName, taskName, serviceName);
	if (service === null) {
		return;
	}
	service.PortLabel = portLabel;
}

//add a check object to the service
Template.prototype.addCheck = function (groupName, taskName, serviceName, checkObj) {
	let service = this.findService(groupName, taskName, serviceName);
	if (service === null) {
		return;
	}
	service.Checks.push(checkObj);
}

// HELPER FUNCTIONS. DON'T ACTUALLY CALL THEM

//returns the group if found. otherwise, return null
Template.prototype.findGroup = function (groupName) {
	return this.findMe(this.getJob().Job.TaskGroups, "Name", groupName);
}

//returns the task if found. otherwise, return null
Template.prototype.findTask = function (groupName, taskName) {
	let group = this.findGroup(groupName);
	if (group === null) {
		return null;
	}
	return this.findMe(group.Tasks, "Name", taskName);
}

//returns the service if found. otherwise, return null
Template.prototype.findService = function (groupName, taskName, serviceName) {
	let task = this.findTask(groupName, taskName);
	if (task === null) {
		return null;
	}
	return this.findMe(task.Services, "Name", serviceName);
}

//finds an object from an array based on the object's key's value
Template.prototype.findMe = function (array, key, value) {
	let found = null;
	for (let i in array) {
		if (array[i][key] === value) {
			found = array[i];
		}
	}
	return found;
}

//returns a file from /templates given just the name of the file
function getJson (fileName) {
	return jsonfile.readFileSync(`${__dirname}/templates/${fileName}.json`);
}
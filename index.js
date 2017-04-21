var needle = require('needle');
var jsonfile = require('jsonfile');

module.exports = {
	createJob: createJob,
	findJob: findJob,
	getJobs: getJobs,
	deleteJob: deleteJob,
	getAllocations: getAllocations,
	watchAllocations: watchAllocations,
	getAllocation: getAllocation,
	getNodes: getNodes,
	getNodeStatus: getNodeStatus,
	getResourceUsage: getResourceUsage
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
			callback(new Template({Job:res.body}));
		}
		else {
			//no core job
			callback(null);
		}	
	});
}

//get all jobs
function getJobs (address, callback) {
	needle.get('http://' + address + '/v1/jobs', function (err, res) {
		if (err) {
			throw err;
		}
		callback(res.body);
	});
}

function deleteJob (jobName, address, callback) {
	needle.delete('http://' + address + '/v1/job/' + jobName, null, function (err, res) {
		callback(res.body);
	});
}

//get an allocation given an ID
function getAllocation (allocID, address, callback) {
	needle.get('http://' + address + '/v1/allocation/' + allocID, function (err, res) {
		if (err) {
			throw err;
		}
		callback(res.body);
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

//watch all allocations for a specific job and return updates when found
function watchAllocations (jobName, address, waitInSeconds, callback) {
	//waitInSeconds determines how long to wait until we hang up the socket and try to send 
	//another request for updates. All waitInSeconds really does is determine the maximum
	//time to wait until we check for updates anyways
	var stopSending = false; //if true, do not watch the endpoint anymore
	var options = {
		open_timeout: waitInSeconds * 1000 //time in milliseconds until we hang up the socket
	}
	var index = 0;

	startWatch();
	function startWatch () {
		if (stopSending) { //don't stop requesting until stopSending is true
			return;
		}
		var url = 'http://' + address + '/v1/job/' + jobName + '/allocations?index=' + index + "&wait=" + waitInSeconds + "s";
		needle.get(url, options, function (err, res) {
			if (err) { //likely a socket hangup. simply make another request assuming stopSending is false
				index = 0; //reset the index. not entirely necessary.
				startWatch();
			}
			else {
				//change the index to that of the returned header for the nomad index
				index = res.headers["x-nomad-index"];
				var allocations = res.body;
				callback(allocations); //send back the data
				//continue watching
				startWatch();		
			}
		});
	}

	return {
		end: function () {
			//if this function is invoked, that means we want to stop listening
			stopSending = true;
		}
	}
}

//returns all nodes in the local region
function getNodes (address, callback) {
	needle.get('http://' + address + '/v1/nodes', function (err, res) {
		if (err) {
			throw err;
		}
		callback(res.body);
	});
}

//get the status of a node using an ID
function getNodeStatus (nodeID, address, callback) {
	needle.get('http://' + address + '/v1/node/' + nodeID, function (err, res) {
		if (err) {
			throw err;
		}
		callback(res.body);
	});
}

//given an address, returns the resource usage of that client agent
function getResourceUsage (address, callback) {
	needle.get('http://' + address + '/v1/client/stats', function (err, res) {
		if (err) {
			throw err;
		}
		callback(res.body);
	});
}


//stream the logs from an allocation
function streamLogs (allocationId, taskName, logType, address, callback) {
	var address = 'http://' + address + '/v1/client/fs/logs/' + allocationId;
	//add query parameters
	var data = {
		task: taskName,
		follow: true, //we want a stream
		type: logType,
		plain: true //plain text streaming!
	}
	//as of nomad 0.5.3 we don't need a stream of JSON data, which removes
	//the possibility of a JSON parsing error with the module
	needle.request('get', address, data)
	.on('data', function (encoded) {
		//base 64 encoding. decode it to utf-8 and return the chunk
		var result = new Buffer(encoded, 'base64').toString('utf-8');
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
	var jobObjectString = JSON.stringify(jobObject);
	needle.post('http://' + address + '/v1/job/', jobObjectString, function (err, res) {
		if (err) {
			throw err;					
		}
		callback(res.body);
	});
}

//do a "fake" submission of a job to see the results
Template.prototype.planJob = function (address, jobName, callback) {
	var jobObject = this.getJob();
	var jobObjectString = JSON.stringify(jobObject);
	needle.post('http://' + address + '/v1/job/' + jobName + "/plan", jobObjectString, function (err, res) {
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

//sets the type of schedule to use for this job
Template.prototype.setType = function (type) {
	this.getJob().Job.Type = type;
}

//sets how updating a job works. staggerTime is in nanoseconds
Template.prototype.setUpdate = function (parallel, staggerTime) {
	this.getJob().Job.Update.Stagger = staggerTime;
	this.getJob().Job.Update.MaxParallel = parallel;
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

//add a path from the host that will be accessible by the container
Template.prototype.addVolume = function (groupName, taskName, path) {
	let task = this.findTask(groupName, taskName);
	if (task === null) {
		return;
	}
	if (!task.Config.volumes) {
		task.Config.volumes = [];
	}
	task.Config.volumes.push(path);
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

//set the CPU limit of the task (MHz)
Template.prototype.setCPU = function (groupName, taskName, cpuNumber) {
	let task = this.findTask(groupName, taskName);
	if (task === null) {
		return;
	}
	task.Resources.CPU = cpuNumber;
}

//set the memory limit of the task (MB)
Template.prototype.setMemory = function (groupName, taskName, memNumber) {
	let task = this.findTask(groupName, taskName);
	if (task === null) {
		return;
	}
	task.Resources.MemoryMB = memNumber;
}

//sets data about the disk for a job group
Template.prototype.setEphemeralDisk = function (groupName, diskSize, migrate, sticky) {
	let group = this.findGroup(groupName);
	if (group === null) {
		return;
	}
	group.EphemeralDisk.Migrate = migrate;
	group.EphemeralDisk.SizeMB = diskSize;
	group.EphemeralDisk.Sticky = sticky;
}

//set the Mbits limit of the task (MB). Only modifies the first network object!
Template.prototype.setMbits = function (groupName, taskName, mBitsNumber) {
	let task = this.findTask(groupName, taskName);
	if (task === null) {
		return;
	}
	task.Resources.Networks[0].MBits = mBitsNumber;
}

//set how many log files to rotate and the size of each
Template.prototype.setLogs = function (groupName, taskName, logFiles, logSize) {
	let task = this.findTask(groupName, taskName);
	if (task === null) {
		return;
	}
	task.LogConfig.MaxFiles = logFiles;
	task.LogConfig.MaxFileSizeMB = logSize;
}

//add an object to the constraints object in the job, group or task level
//there is no enforcement of what the object should be. be careful
Template.prototype.addConstraint = function (constraint, groupName, taskName) {
	//if there is no group name, add the constraint to the job 
	//if there is a group name but no task name, add the constraint to the specified group 
	//if there is a group name and task name, add the constraint to the specified task
	if (!groupName) {
		this.getJob().Job.Constraints.push(constraint);
	} 
	else {
		let	group = this.findGroup(groupName);
		if (!taskName) {
			if (group === null) {
				return null;
			}
			group.Constraints.push(constraint);
		}
		else {
			let task = this.findTask(groupName, taskName);
			if (task === null) {
				return null;
			}
			task.Constraints.push(constraint);
		}

	}
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
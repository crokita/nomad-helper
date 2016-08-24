var mocha = require('mocha');
var assert = require('assert');
var nomader = require('../index.js');

describe('#createJob()', function () {
	it('should return an instance of the Template class', function () {
		var job = nomader.createJob("core");
		assert.strictEqual(job.constructor.name, "Template");
	});
});

describe('#getJob()', function () {
	it('should return a job object for passing to Nomad', function () {
		var job = nomader.createJob("core").getJob();
		assert.notStrictEqual(job.Job, undefined);
	});
});


describe('#addGroup()', function () {
	it('should add a TaskGroup object from the template to the job', function () {
		var job = nomader.createJob("job");
		job.addGroup("group1");
		assert.strictEqual(job.getJob().Job.TaskGroups[0].Name, "group1");
	});
});

describe('#findGroup()', function () {
	it('should return a group created in the job', function () {
		var job = nomader.createJob("job");
		job.addGroup("group1");
		job.addGroup("group2");
		var group = job.findGroup("group2");
		assert.strictEqual(group.Name, "group2");
	});
});

describe('#addTask()', function () {
	it('should add a Task object from the template to the job', function () {
		var job = nomader.createJob("job");
		job.addGroup("group1");
		job.addTask("group1", "task1");
		assert.strictEqual(job.getJob().Job.TaskGroups[0].Tasks[0].Name, "task1");
	});
});

describe('#findTask()', function () {
	it('should return a task created in the job', function () {
		var job = nomader.createJob("job");
		job.addGroup("group1");
		job.addGroup("group2");
		job.addTask("group2", "task1");
		job.addTask("group2", "task2");
		var task = job.findTask("group2", "task2");
		assert.strictEqual(task.Name, "task2");
	});
});

describe('#addService()', function () {
	it('should add a Service object from the template to the job', function () {
		var job = nomader.createJob("job");
		job.addGroup("group1");
		job.addTask("group1", "task1");
		job.addService("group1", "task1", "service1");
		assert.strictEqual(job.getJob().Job.TaskGroups[0].Tasks[0].Services[0].Name, "service1");
	});
});

describe('#findService()', function () {
	it('should return a service created in the job', function () {
		var job = nomader.createJob("job");
		job.addGroup("group1");
		job.addGroup("group2");
		job.addTask("group2", "task1");
		job.addTask("group2", "task2");
		job.addService("group2", "task2", "service1");
		job.addService("group2", "task2", "service2");
		var service = job.findService("group2", "task2", "service2");
		assert.strictEqual(service.Name, "service2");
	});
});

describe('#getCount()', function () {
	it('should return the count property inside the group. defaults to 1', function () {
		var job = nomader.createJob("job");
		job.addGroup("group1");
		var count = job.getCount("group1");
		assert.strictEqual(count, 1);
	});
});

describe('#setCount()', function () {
	it('should modify the count property inside the group', function () {
		var job = nomader.createJob("job");
		job.addGroup("group1");
		job.setCount("group1", 3);
		assert.strictEqual(job.getCount("group1"), 3);
	});
});

describe('#setImage()', function () {
	it('should modify the image property inside the task', function () {
		let imageName = "user/test-image"
		var job = nomader.createJob("job");
		job.addGroup("group1");
		job.addTask("group1", "task1");
		job.setImage("group1", "task1", imageName);
		assert.strictEqual(job.findTask("group1", "task1").Config.image, imageName);
	});
});

describe('#addPort()', function () {
	it('should create a configuration for a static port', function () {
		let portName = "http";
		let portNumber = "9876";
		var job = nomader.createJob("job");
		job.addGroup("group1");
		job.addTask("group1", "task1");
		job.addPort("group1", "task1", false, portName, portNumber);
		let portObj = job.findTask("group1", "task1").Resources.Networks[0].ReservedPorts[0];
		assert.deepStrictEqual(portObj, {"Label": portName, "Value": portNumber});
	});

	it('should create a configuration for a dynamic port with no mapping', function () {
		let portName = "http";
		var job = nomader.createJob("job");
		job.addGroup("group1");
		job.addTask("group1", "task1");
		job.addPort("group1", "task1", true, portName);
		let portObj = job.findTask("group1", "task1").Resources.Networks[0].DynamicPorts[0];
		assert.deepStrictEqual(portObj, {"Label": portName, "Value": 0});
		assert.deepStrictEqual(job.findTask("group1", "task1").Config, {});
	});

	it('should create a configuration for a dynamic port with mapping', function () {
		let portName = "http";
		let portNumber = "9876";
		var job = nomader.createJob("job");
		job.addGroup("group1");
		job.addTask("group1", "task1");
		job.addPort("group1", "task1", true, portName, portNumber);
		let portObj = job.findTask("group1", "task1").Resources.Networks[0].DynamicPorts[0];
		let mappingObj = job.findTask("group1", "task1").Config.port_map[0];
		assert.deepStrictEqual(portObj, {"Label": portName, "Value": 0});
		let actualObj = {};
		actualObj[portName] = portNumber;
		assert.deepStrictEqual(mappingObj, actualObj);
	});
});

describe('#addEnv()', function () {
	it('should add an environment key and value pair to the job', function () {
		let key = "key";
		let value = 1;
		var job = nomader.createJob("job");
		job.addGroup("group1");
		job.addTask("group1", "task1");
		job.addEnv("group1", "task1", key, value);
		assert.strictEqual(job.findTask("group1", "task1").Env[key], value);
	});
});

describe('#addTag()', function () {
	it('should add a tag to a service', function () {
		let tag = "tag";
		var job = nomader.createJob("job");
		job.addGroup("group1");
		job.addTask("group1", "task1");
		job.addService("group1", "task1", "service1");
		job.addTag("group1", "task1", "service1", tag);
		assert.strictEqual(job.findService("group1", "task1", "service1").Tags[0], tag);
	});
});

describe('#setPortLabel()', function () {
	it('should set the port of a service', function () {
		let port = 12345;
		var job = nomader.createJob("job");
		job.addGroup("group1");
		job.addTask("group1", "task1");
		job.addService("group1", "task1", "service1");
		job.setPortLabel("group1", "task1", "service1", port);
		assert.strictEqual(job.findService("group1", "task1", "service1").PortLabel, port);
	});
});

describe('#addCheck()', function () {
	it('should add a check to a service', function () {
		let check = {
			"Name": "alive"
		};
		var job = nomader.createJob("job");
		job.addGroup("group1");
		job.addTask("group1", "task1");
		job.addService("group1", "task1", "service1");
		job.addCheck("group1", "task1", "service1", check);
		assert.deepStrictEqual(job.findService("group1", "task1", "service1").Checks[0], check);
	});
});
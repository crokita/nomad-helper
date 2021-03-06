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

describe('#setType()', function () {
	it('should set a scheduler type for the job', function () {
		var job = nomader.createJob("job");
		job.setType("service");
		assert.strictEqual(job.getJob().Job.Type, "service");
	});
});

describe('#setUpdate()', function () {
	it('should set an update object for the job', function () {
		var job = nomader.createJob("job");
		job.setUpdate(3, 10000000000);
		assert.strictEqual(job.getJob().Job.Update.Stagger, 10000000000);
		assert.strictEqual(job.getJob().Job.Update.MaxParallel, 3);
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

describe('#setRestartPolicy()', function () {
	it('should modify the RestartPolicy property inside the group', function () {
		var job = nomader.createJob("job");
		var obj = {
			Interval: 30000,
			Attempts: 5,
			Delay: 60000,
			Mode: "delay"
		};
		job.addGroup("group1");
		job.setRestartPolicy("group1", obj.Interval, obj.Attempts, obj.Delay, obj.Mode);
		assert.deepStrictEqual(job.findGroup("group1").RestartPolicy, obj);
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

describe('#addVolume()', function () {
	it('should add a volume path to the job', function () {
		let path = "testing";
		var job = nomader.createJob("job");
		job.addGroup("group1");
		job.addTask("group1", "task1");
		job.addVolume("group1", "task1", path);
		assert.strictEqual(job.findTask("group1", "task1").Config.volumes[0], path);
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

describe('#setCPU()', function () {
	it('should set the CPU limit of a task', function () {
		let limit = 100;
		var job = nomader.createJob("job");
		job.addGroup("group1");
		job.addTask("group1", "task1");
		job.setCPU("group1", "task1", limit);
		assert.strictEqual(job.findTask("group1", "task1").Resources.CPU, limit);
	});
});

describe('#setMemory()', function () {
	it('should set the memory limit of a task', function () {
		let limit = 100;
		var job = nomader.createJob("job");
		job.addGroup("group1");
		job.addTask("group1", "task1");
		job.setMemory("group1", "task1", limit);
		assert.strictEqual(job.findTask("group1", "task1").Resources.MemoryMB, limit);
	});
});

describe('#setEphemeralDisk()', function () {
	it('should set the disk properties of a task group', function () {
		let limit = 100;
		let sticky = true;
		let migrate = false;
		var job = nomader.createJob("job");
		job.addGroup("group1");
		job.setEphemeralDisk("group1", limit, migrate, sticky);
		assert.strictEqual(job.findGroup("group1").EphemeralDisk.SizeMB, limit);
		assert.strictEqual(job.findGroup("group1").EphemeralDisk.Migrate, migrate);
		assert.strictEqual(job.findGroup("group1").EphemeralDisk.Sticky, sticky);
	});
});

describe('#setMbits()', function () {
	it('should set the mbits limit of a task', function () {
		let limit = 100;
		var job = nomader.createJob("job");
		job.addGroup("group1");
		job.addTask("group1", "task1");
		job.setMbits("group1", "task1", limit);
		assert.strictEqual(job.findTask("group1", "task1").Resources.Networks[0].MBits, limit);
	});
});

describe('#setLogs()', function () {
	it('should set the log configurations of a task', function () {
		let files = 5;
		let limit = 10;
		var job = nomader.createJob("job");
		job.addGroup("group1");
		job.addTask("group1", "task1");
		job.setLogs("group1", "task1", files, limit);
		assert.strictEqual(job.findTask("group1", "task1").LogConfig.MaxFiles, files);
		assert.strictEqual(job.findTask("group1", "task1").LogConfig.MaxFileSizeMB, limit);
	});
});

var exampleConstraint = {
	test: "123"
}

describe('#addConstraint()', function () {
	it('should add a constraint on the job level if group is not defined', function () {
		var job = nomader.createJob("job");
		job.addGroup("group1");
		job.addTask("group1", "task1");
		job.addConstraint(exampleConstraint);
		assert.strictEqual(job.getJob().Job.Constraints[0], exampleConstraint);
	});

	it('should add a constraint on the job level if task is defined and group is not defined', function () {
		var job = nomader.createJob("job");
		job.addGroup("group1");
		job.addTask("group1", "task1");
		job.addConstraint(exampleConstraint, undefined, "task1");
		assert.strictEqual(job.getJob().Job.Constraints[0], exampleConstraint);
	});

	it('should add a constraint on the group level if task is undefined and group is defined', function () {
		var job = nomader.createJob("job");
		job.addGroup("group1");
		job.addTask("group1", "task1");
		job.addConstraint(exampleConstraint, "group1");
		assert.strictEqual(job.findGroup("group1").Constraints[0], exampleConstraint);
	});

	it('should add a constraint on the task level if task is defined and group is defined', function () {
		var job = nomader.createJob("job");
		job.addGroup("group1");
		job.addTask("group1", "task1");
		job.addConstraint(exampleConstraint, "group1", "task1");
		assert.strictEqual(job.findTask("group1", "task1").Constraints[0], exampleConstraint);
	});
});
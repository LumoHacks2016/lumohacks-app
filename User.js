class User {
	
	constructor(name, password, socket) {
		this.name = name;
		this.password = password;
		this.available = true;
		this.socket = socket;
		this.tags = [];
		this.description = "";
	}
}


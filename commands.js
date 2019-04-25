/**
 * Commands
 * Cassius - https://github.com/sirDonovan/Cassius
 *
 * This file contains the base commands for Cassius.
 *
 * @license MIT license
 */

'use strict';

// Users who use the settour command when a tournament is already
// scheduled will be added here and prompted to reuse the command.
// This prevents accidentally overwriting a scheduled tournament.
/**@type {Map<string, string>} */
let overwriteWarnings = new Map();

/**@type {{[k: string]: Command | string}} */
let commands = {
	// Developer commands
	js: 'eval',
	eval: function (target, room, user) {
		if (!user.isDeveloper()) return;
		try {
			target = eval(target);
			this.say(JSON.stringify(target));
		} catch (e) {
			this.say(e.name + ": " + e.message);
		}
	},

	// General commands
	about: function (target, room, user) {
		if (!(room instanceof Users.User) && !user.hasRank(room, '+')) return;
		this.say(Config.username + " code by sirDonovan: https://github.com/sirDonovan/Cassius");
	},
	help: function (target, room, user) {
		if (!(room instanceof Users.User) && !user.hasRank(room, '+')) return;
		if (!Config.guide) return this.say("There is no guide available.");
		this.say(Users.self.name + " guide: " + Config.guide);
	},
	mail: function (target, room, user) {
		if (!(room instanceof Users.User) || !Config.allowMail) return;
		let targets = target.split(',');
		if (targets.length < 2) return this.say("Please use the following format: .mail user, message");
		let to = Tools.toId(targets[0]);
		if (!to || to.length > 18 || to === Users.self.id || to.startsWith('guest')) return this.say("Please enter a valid username");
		let message = targets.slice(1).join(',').trim();
		let id = Tools.toId(message);
		if (!id) return this.say("Please include a message to send.");
		if (message.length > (258 - user.name.length)) return this.say("Your message is too long.");
		let database = Storage.getDatabase('global');
		if (to in database.mail) {
			let queued = 0;
			for (let i = 0, len = database.mail[to].length; i < len; i++) {
				if (Tools.toId(database.mail[to][i].from) === user.id) queued++;
			}
			if (queued >= 3) return this.say("You have too many messages queued for " + Users.add(targets[0]).name + ".");
		} else {
			database.mail[to] = [];
		}
		database.mail[to].push({time: Date.now(), from: user.name, text: message});
		Storage.exportDatabase('global');
		this.say("Your message has been sent to " + Users.add(targets[0]).name + "!");
	},
	
	 timer: function (target, room, user) {
		if (!user.hasRank(room, '+') && (!Games.host || Games.host.id !== user.id)) return;
		let x = Math.floor(target);
		if (!x || x >= 120 || (x < 10 && x > 2) || x <= 0) return room.say("The timer must be between 10 seconds and 2 minutes.");
		if (x === 1) x = 60;
		let minutes = Math.floor(x / 60);
		let seconds = x % 60;
		clearTimeout(Games.timeout);
		this.say("Timer set for " + (minutes > 0 ? "1 minute" + (seconds > 0 ? " and " : "") : "") + (seconds > 0 ? ((seconds) + " second" + (seconds > 1 ? "s" : "")) : "") + ".");
		setTimeout(() => this.say("Times Up!"), x * 1000);
	},
	
	

	// Game commands
	signups: 'creategame',
	creategame: function (target, room, user) {
		if (room instanceof Users.User) return;
		if (!user.hasRank(room, '+')) return;
		if (!Config.games || !Config.games.includes(room.id)) return this.say("Games are not enabled for this room.");
		let format = Games.getFormat(target);
		if (!format || format.inheritOnly) return this.say("The game '" + target + "' was not found.");
		if (format.internal) return this.say(format.name + " cannot be started manually.");
		Games.createGame(format, room);
		if (!room.game) return;
		room.game.signups();
	},
	start: 'startgame',
	startgame: function (target, room, user) {
		if (!(room instanceof Users.User) && !user.hasRank(room, '+')) return;
		if (room.game) room.game.start();
	},
	cap: 'capgame',
	capgame: function (target, room, user) {
		if (room instanceof Users.User || !room.game || !user.hasRank(room, '+')) return;
		let cap = parseInt(target);
		if (isNaN(cap)) return this.say("Please enter a valid player cap.");
		if (cap < room.game.minPlayers) return this.say(room.game.name + " must have at least " + room.game.minPlayers + " players.");
		if (room.game.maxPlayers && cap > room.game.maxPlayers) return this.say(room.game.name + " cannot have more than " + room.game.maxPlayers + " players.");
		room.game.playerCap = cap;
		this.say("The game will automatically start at **" + cap + "** players!");
	},
	
	mp: 'maxpoints',
	maxpoints: function (target, room, user) {
		if (room instanceof Users.User || !room.game || !user.hasRank(room, '+')) return;
		let mp = parseInt(target);
		if (isNaN(mp)) return this.say("Please enter a valid value.");
		room.game.maxPoints = mp;
		this.say("Player with **" + mp + "** points wins the game!");
	},
	
	end: 'endgame',
	endgame: function (target, room, user) {
		if (!(room instanceof Users.User) && !user.hasRank(room, '+')) return;
		if (room.game) room.game.forceEnd();
	},
	join: 'joingame',
	joingame: function (target, room, user) {
		if (room instanceof Users.User || !room.game) return;
		room.game.join(user);
	},
	leave: 'leavegame',
	leavegame: function (target, room, user) {
		if (room instanceof Users.User || !room.game) return;
		room.game.leave(user);
	},
	
	elim: 'eliminate',
	eliminate: function (target, room, user) {
		if (room instanceof Users.User || !room.game || !user.hasRank(room, '@')) return;
		room.game.elim(target);
	},
	

	// Storage commands
	bits: 'points',
	points: function (target, room, user) {
		if (room !== user) return;
		let targetUserid = target ? Tools.toId(target) : user.id;
		/**@type {Array<string>} */
		let points = [];
		user.rooms.forEach((rank, room) => {
			if (!(room.id in Storage.databases) || !('leaderboard' in Storage.databases[room.id])) return;
			if (targetUserid in Storage.databases[room.id].leaderboard) points.push("**" + room.id + "**: " + Storage.databases[room.id].leaderboard[targetUserid].points);
		});
		if (!points.length) return this.say((target ? target.trim() + " does not" : "You do not") + " have points on any leaderboard.");
		this.say(points.join(" | "));
	},
	
	choose: function (target, room, user) {
		for (room in Rooms.rooms) {
			let realRoom = Rooms.rooms[room];
			if (realRoom.game && typeof realRoom.game.choose === 'function') realRoom.game.choose(user, target);
		}
	},

	suspect: function (target, room, user) {
		if (room.name !== user.name) return;
		let firstComma = target.indexOf(',');
		if (firstComma === -1) {
			user.say("The correct syntax is " + Config.commandCharacter + "suspect user, pokemon, room");
			return;
		}
		let userID = target.substr(0, firstComma);
		target = target.substr(firstComma + 1);
		if (target.charAt(0) === ' ') {
			target = target.substr(1);
		}
		for (room in Rooms.rooms) {
			let realRoom = Rooms.rooms[room];
			if (realRoom.game && typeof realRoom.game.suspect === 'function') realRoom.game.suspect(user, userID, target);
		}
	},
	
	steal: function (target, room, user) {
		if (!room.game) return;
		if (typeof room.game.steal === 'function') room.game.steal(target, user);
	},
	
	count: function (target, room, user) {
		if (!room.game) {
			if (!user.hasRank(room, '+') || Tools.toId(target) !== "start") {
				return;
			}
			Games.createGame("count", room)
		} else if (typeof room.game.count === 'function') {
			room.game.count(target,user);
		}
	},
	

	// Tournament commands
	tour: 'tournament',
	tournament: function (target, room, user) {
		if (room instanceof Users.User || !Config.tournaments || !Config.tournaments.includes(room.id)) return;
		if (!target) {
			if (!user.hasRank(room, '+')) return;
			if (!room.tour) return this.say("I am not currently tracking a tournament in this room.");
			let info = "``" + room.tour.name + " tournament info``";
			if (room.tour.startTime) {
				return this.say(info + ": **Time**: " + Tools.toDurationString(Date.now() - room.tour.startTime) + " | **Remaining players**: " + room.tour.getRemainingPlayerCount() + '/' + room.tour.totalPlayers);
			} else if (room.tour.started) {
				return this.say(info + ": **Remaining players**: " + room.tour.getRemainingPlayerCount() + '/' + room.tour.totalPlayers);
			} else {
				return this.say(info + ": " + room.tour.playerCount + " player" + (room.tour.playerCount > 1 ? "s" : ""));
			}
		} else {
			if (!user.hasRank(room, '%')) return;
			let targets = target.split(',');
			let cmd = Tools.toId(targets[0]);
			let format;
			switch (cmd) {
			case 'end':
				this.say("/tour end");
				break;
			case 'start':
				this.say("/tour start");
				break;
			default:
				format = Tools.getFormat(cmd);
				if (!format) return this.say('**Error:** invalid format.');
				if (!format.playable) return this.say(format.name + " cannot be played, please choose another format.");
				let cap;
				if (targets[1]) {
					cap = parseInt(Tools.toId(targets[1]));
					if (cap < 2 || cap > Tournaments.maxCap || isNaN(cap)) return this.say("**Error:** invalid participant cap.");
				}
				this.say("/tour new " + format.id + ", elimination, " + (cap ? cap + ", " : "") + (targets.length > 2 ? ", " + targets.slice(2).join(", ") : ""));
			}
		}
	},
	settour: 'settournament',
	settournament: function (target, room, user) {
		if (room instanceof Users.User || !Config.tournaments || !Config.tournaments.includes(room.id) || !user.hasRank(room, '%')) return;
		if (room.id in Tournaments.tournamentTimers) {
			let warned = overwriteWarnings.has(room.id) && overwriteWarnings.get(room.id) === user.id;
			if (!warned) {
				overwriteWarnings.set(room.id, user.id);
				return this.say("A tournament has already been scheduled in this room. To overwrite it, please reuse this command.");
			}
			overwriteWarnings.delete(room.id);
		}
		let targets = target.split(',');
		if (targets.length < 2) return this.say(Config.commandCharacter + "settour - tier, time, cap (optional)");
		let format = Tools.getFormat(targets[0]);
		if (!format) return this.say('**Error:** invalid format.');
		if (!format.playable) return this.say(format.name + " cannot be played, please choose another format.");
		let date = new Date();
		let currentTime = (date.getHours() * 60 * 60 * 1000) + (date.getMinutes() * (60 * 1000)) + (date.getSeconds() * 1000) + date.getMilliseconds();
		let targetTime = 0;
		if (targets[1].includes(':')) {
			let parts = targets[1].split(':');
			let hours = parseInt(parts[0]);
			let minutes = parseInt(parts[1]);
			if (isNaN(hours) || isNaN(minutes)) return this.say("Please enter a valid time.");
			targetTime = (hours * 60 * 60 * 1000) + (minutes * (60 * 1000));
		} else {
			let hours = parseFloat(targets[1]);
			if (isNaN(hours)) return this.say("Please enter a valid time.");
			targetTime = currentTime + (hours * 60 * 60 * 1000);
		}
		let timer = targetTime - currentTime;
		if (timer <= 0) timer += 24 * 60 * 60 * 1000;
		Tournaments.setTournamentTimer(room, timer, format.id, targets[2] ? parseInt(targets[2]) : 0);
		this.say("The " + format.name + " tournament is scheduled for " + Tools.toDurationString(timer) + ".");
	},
	canceltour: 'canceltournament',
	canceltournament: function (target, room, user) {
		if (room instanceof Users.User || !Config.tournaments || !Config.tournaments.includes(room.id) || !user.hasRank(room, '%')) return;
		if (!(room.id in Tournaments.tournamentTimers)) return this.say("There is no tournament scheduled for this room.");
		clearTimeout(Tournaments.tournamentTimers[room.id]);
		this.say("The scheduled tournament was canceled.");
	},
};

module.exports = commands;

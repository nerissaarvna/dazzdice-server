import express from 'express';
import cors from 'cors';
import { WebSocket, WebSocketServer } from 'ws';
import { createServer } from 'http';
import { v4 as uuidv4 } from 'uuid';
import { Op } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { EventEmitter } from 'events';
import _ from 'lodash';
import { evaluate } from 'mathjs';

import { User, Match, Challenge, Question, ChallengeLeaderboard, MatchLeaderboard } from './models.js';
import * as q from './maths.js';

class DataEvent {
    event: string;
    sender: string;
    params: { [param: string]: any } = {};

    constructor(event: string, sender: string, params: object = {}) {
        this.event = event;
        this.sender = sender;
        this.params = params;
    }
}


class MatchMakingManager {
    wss = new WebSocketServer({ noServer: true, path: '/mm' });
    conn: { [id: string]: WebSocket } = {};
    queue = new Set<string>();
    eventEmitter = new EventEmitter();

    constructor() {
        this.eventEmitter.on("search_opponent", async (data: DataEvent) => {
            this.queue.add(data.sender);
        });

        setInterval(match_two_players, 3000);
    }

    connect(ws: WebSocket, user: User) {
        this.conn[user.id] = ws;
    }

    disconnect(id: string) {
        this.conn[id]?.close();
        this.queue.delete(id);
        delete this.conn[id];
    }

    broadcast(data: DataEvent, self: boolean = false) {
        Object.entries(this.conn).forEach((k, v) => {
            if (self) {
                if (k[1].readyState === WebSocket.OPEN) {
                    k[1].send(JSON.stringify(data));
                }
            } else {
                if (k[0] != data.sender && k[1].readyState === WebSocket.OPEN) {
                    k[1].send(JSON.stringify(data));
                }
            }
        });
    }
}

let mm = new MatchMakingManager();

function match_two_players() {
    if (mm.queue.size > 1) {
        var matchs = _.chunk(_.shuffle(Array.from(mm.queue.values())), 2);

        _.remove(matchs, (e) => {
            return e.length != 2;
        })

        matchs.forEach(async (e) => {
            var match = await Match.create({ id: uuidv4(), player1Id: e[0], player2Id: e[1] },);

            //var [match, _] = await Match.findOrCreate({ where: { id: '1' }, defaults: { player1Id: e[0], player2Id: e[1], round: 5 } })

            var player1 = await match.$get('player1', { include: [MatchLeaderboard] });
            var player2 = await match.$get('player2', { include: [MatchLeaderboard] });

            match = match.toJSON()

            match.player1 = player1!.toJSON();
            match.player2 = player2!.toJSON();

            var data = new DataEvent("match", "server");

            data.params = { "match": match }

            vsarena.matchs[match.id] = match

            e.forEach(async (n) => {
                mm.conn[n]?.send(JSON.stringify(data));
                mm.disconnect(n);
            });
        });

    } else {

    }
}

class VsArenaManager {
    wss = new WebSocketServer({ noServer: true, path: '/arena' });
    conn: { [id: string]: WebSocket } = {};
    matchs: { [id: string]: Match } = {};
    matchs_question: { [id: string]: { [id: string]: number | null } } = {};
    eventEmitter = new EventEmitter();
    match_check_interval: { [id: string]: NodeJS.Timeout } = {};

    constructor() {
        this.eventEmitter.on("ready", async (data: DataEvent) => {
            var match: Match = data.params!["match"];

            if (data.sender == this.matchs[match.id].player1Id) {
                this.matchs[match.id].player1Status = 'ready'
                if (this.matchs[match.id].player2Id == "0") {
                    this.matchs[match.id].player2Status = 'ready'
                }
            } else if (data.sender == this.matchs[match.id].player2Id) {
                this.matchs[match.id].player2Status = 'ready'
            }

            if (this.matchs[match.id].player1Status == "ready" && this.matchs[match.id].player2Status == "ready") {
                var oldQ: Question | null = data.params["question"];

                var difficulty = oldQ?.difficulty;

                if (difficulty == null) {
                    difficulty = 1
                } else {
                    difficulty++;
                }

                var question = q.getQuestDice(difficulty)

                question.matchId = match.id

                await question.save()

                data.event = 'question'
                data.params['question'] = question.toJSON()
                data.params['question']['wrong'] = question.wrong

                this.conn[this.matchs[match.id].player1Id]?.send(JSON.stringify(data));
                this.conn[this.matchs[match.id].player2Id]?.send(JSON.stringify(data));

                this.matchs_question[question.id] = {
                    "timestamp": Date.now(),
                    "player1_a": null,
                    "player2_a": null,
                    "player1_r": null,
                    "player2_r": null,
                    "score1": null,
                    "score2": null,
                };
            }
        });

        this.eventEmitter.on("answer", async (data: DataEvent) => {
            var match: Match = data.params!["match"];
            var question: Question = data.params!["question"];
            var answer: number = data.params!["answer"];
            var remaining_seconds: number = data.params!["remaining_seconds"];
            var max_score_bound = 8;
            var max_score = 1000;
            var score1 = 0;
            var score2 = 0

            if (data.sender == this.matchs[match.id].player1Id) {
                this.matchs_question[question.id]["player1_a"] = answer
                this.matchs_question[question.id]["player1_r"] = remaining_seconds

                data.event = "opponent_locked"

                this.conn[this.matchs[match.id].player2Id]?.send(JSON.stringify(data));
            }
            else if (data.sender == this.matchs[match.id].player2Id) {
                this.matchs_question[question.id]["player2_a"] = answer
                this.matchs_question[question.id]["player2_r"] = remaining_seconds

                data.event = "opponent_locked"

                this.conn[this.matchs[match.id].player1Id]?.send(JSON.stringify(data));
            }

            if (this.matchs_question[question.id]["player1_a"] != null && this.matchs_question[question.id]["player2_a"] != null) {
                if (question.answer == this.matchs_question[question.id]["player1_a"]!) {
                    if (this.matchs_question[question.id]["player1_r"]! < max_score_bound) {
                        score1 = Math.floor(max_score - ((max_score / max_score_bound) * (max_score_bound - this.matchs_question[question.id]["player1_r"]!)));
                    } else {
                        score1 = 1000;
                    }

                    this.matchs[match.id].score1 += score1

                }

                this.matchs_question[question.id]["score1"] = score1

                if (question.answer == this.matchs_question[question.id]["player2_a"]!) {
                    if (this.matchs_question[question.id]["player2_r"]! < max_score_bound) {
                        score2 = Math.floor(max_score - ((max_score / max_score_bound) * (max_score_bound - this.matchs_question[question.id]["player2_r"]!)));
                    } else {
                        score2 = 1000
                    }

                    this.matchs[match.id].score2 += score2

                }

                this.matchs_question[question.id]["score2"] = score2

                await Question.update({ score: score1, score2: score2 }, { where: { id: question.id } })

                await Match.update({
                    score1: Sequelize.literal(`score1 + ${score1}`),
                    score2: Sequelize.literal(`score2 + ${score2}`)
                },
                    { where: { id: match.id } }
                )

                data.event = 'answer'

                data.params["match"] = this.matchs[match.id]
                data.params['result'] = this.matchs_question[question.id]

                this.conn[this.matchs[match.id].player1Id]?.send(JSON.stringify(data));
                this.conn[this.matchs[match.id].player2Id]?.send(JSON.stringify(data));

                delete this.matchs_question[question.id];
            }
        });

        // Menerima event "end" dimana client menghentikan permainan baik karena waktu habis atau keluar dari permainan dan mengirimkan hasil sesi permainan kembali ke client bersangkutan
        this.eventEmitter.on("end", async (data: DataEvent) => {
            var match: Match = data.params!["match"];
            var question: Question = data.params!["question"];

            if (question.difficulty < match.round) {
                this.eventEmitter.emit("ready", data)
            } else {
                var matchE = await Match.findByPk(match.id,
                    {
                        include: [{
                            model: User, as: 'player1',
                            include: [MatchLeaderboard]
                        }, {
                            model: User, as: 'player2',
                            include: [MatchLeaderboard]
                        }]
                    }) as Match

                if (matchE.score1 > matchE.score2) {
                    var [d1, d2] = DeltaRating(matchE.player1.matchLeaderboard.rating, matchE.player2.matchLeaderboard.rating, 1)

                    await matchE.update({ winner: 1 })

                    await matchE.player1.matchLeaderboard.increment({ rating: d1, plays: 1, wins: 1 })
                    await matchE.player2.matchLeaderboard.increment({ rating: d2, plays: 1, loses: 1 })
                } else if (matchE.score1 < matchE.score2) {
                    var [d1, d2] = DeltaRating(matchE.player1.matchLeaderboard.rating, matchE.player2.matchLeaderboard.rating, 2)

                    await matchE.update({ winner: 2 })

                    await matchE.player1.matchLeaderboard.increment({ rating: d1, plays: 1, loses: 1 })
                    await matchE.player2.matchLeaderboard.increment({ rating: d2, plays: 1, wins: 1 })
                } else {
                    var [d1, d2] = DeltaRating(matchE.player1.matchLeaderboard.rating, matchE.player2.matchLeaderboard.rating, 0)

                    await matchE.update({ winner: 0 })

                    await matchE.player1.matchLeaderboard.increment({ rating: d1, plays: 1, draws: 0 })
                    await matchE.player2.matchLeaderboard.increment({ rating: d2, plays: 1, draws: 0 })
                }

                await matchE.reload()

                data.event = "end"
                data.params = { "match": matchE }
                lobby.broadcast(new DataEvent("match_leader", "server"));
                this.conn[this.matchs[match.id].player1Id]?.send(JSON.stringify(data));
                this.conn[this.matchs[match.id].player2Id]?.send(JSON.stringify(data));

                this.disconnect(this.matchs[match.id].player1Id)
                this.disconnect(this.matchs[match.id].player2Id)

                delete this.matchs[match.id]
            }
        });
    }

    connect(ws: WebSocket, user: User) {
        this.conn[user.id] = ws;
    }

    disconnect(id: string) {
        this.conn[id]?.close();
        delete this.conn[id];
    }
}

// https://www.geeksforgeeks.org/elo-rating-algorithm/
function Probability(rating1: number, rating2: number) {
    return (
        (1.0 * 1.0) / (1 + 1.0 * Math.pow(10, (1.0 * (rating1 - rating2)) / 400))
    );
}

function DeltaRating(Ra: number, Rb: number, winner: number, K: number = 50,) {
    let Pb = Probability(Ra, Rb);

    let Pa = Probability(Rb, Ra);

    let Da = 0;
    let Db = 0;

    if (winner == 1) {
        Da = K * (1 - Pa);
        Db = K * (0 - Pb);
    }

    else if (winner == 2) {
        Da = K * (0 - Pa);
        Db = K * (1 - Pb);
    }
    else if (winner == 0) {
        Da = K * (0.5 - Pa);
        Db = K * (0.5 - Pb);
    }

    return [Math.round(Da), Math.round(Db)]
}

let vsarena = new VsArenaManager();

class ChallengeArenaManager {
    wss = new WebSocketServer({ noServer: true, path: '/challenge' });
    conn: { [id: string]: WebSocket } = {};
    questions: { [id: string]: number } = {};
    eventEmitter = new EventEmitter();

    constructor() {
        // Menerima event "get_q" untuk menghasilkan pertanyaan berdasarkan level kesulitan dan mengirimkannya kembali ke client bersangkutan
        this.eventEmitter.on("get_q", async (data: DataEvent) => {
            var challenge: Challenge = data.params!["challenge"];
            var difficulty: number = data.params!["difficulty"];

            if (difficulty == null) {
                difficulty = 1
            } else {
                difficulty++;
            }

            var question = q.getQuestDice(difficulty)

            question.challengeId = challenge.id

            await question.save()

            data.event = 'question'
            data.params['question'] = question.toJSON()
            data.params['question']['wrong'] = question.wrong

            this.conn[data.sender]?.send(JSON.stringify(data));

            this.questions[question.id] = Date.now();
        });

        // Menerima event "answer" untuk memproses pertanyaan untuk mendapatkan skor berdasarkan waktu tersisa dan hasil proses kembali ke client bersangkutan
        this.eventEmitter.on("answer", async (data: DataEvent) => {
            var challenge: Challenge = data.params!["challenge"];
            var question: Question = data.params!["question"];
            var answer: number = data.params!["answer"];
            var remaining_seconds: number = data.params!["remaining_seconds"];
            var max_score_bound = 8;
            var score = 1000;

            if (question.answer == answer) {
                var cur_time = Date.now();

                // Memperhitungkan delay antara server & client, jika delay lebih dari 1 detik maka ambil waktu server.
                // Belum diimplementasikan di client
                var server_remaining_seconds = 10 - ((cur_time - this.questions[question.id]) / 1000);
                if (server_remaining_seconds - remaining_seconds > 1) {
                    remaining_seconds = server_remaining_seconds;
                    data.params["time_correction"] = remaining_seconds;
                }


                if (remaining_seconds < max_score_bound) {
                    score = Math.floor(score - ((score / max_score_bound) * (max_score_bound - remaining_seconds)));
                }
            } else {
                score = 0
            }
            await Question.update({ score: score }, { where: { id: question.id } })
            await Challenge.update({
                score: Sequelize.literal(`score + ${score}`),
                round: Sequelize.literal(`round + 1`)
            },
                { where: { id: challenge.id } })


            data.event = "result"
            data.params['score'] = score
            delete this.questions[question.id]

            this.conn[data.sender]?.send(JSON.stringify(data));
        });

        // Menerima event "end" dimana client menghentikan permainan baik karena waktu habis atau keluar dari permainan dan mengirimkan hasil sesi permainan kembali ke client bersangkutan
        this.eventEmitter.on("end", async (data: DataEvent) => {
            var challenge: Challenge = data.params["challenge"];
            var cur_score: number = data.params["cur_score"]

            var chal = await Challenge.findByPk(challenge.id, { include: [{ model: User, include: [ChallengeLeaderboard] }] }) as Challenge;

            if (chal?.round != 0) {
                if (chal.player.challengeLeaderboard == null) {
                    await ChallengeLeaderboard.create({
                        playerId: data.sender,
                        challengeId: chal.id,
                        plays: 1,
                        round: chal.round,
                        score: chal.score
                    })
                } else {
                    if (cur_score < chal!.score) {
                        await chal.player.challengeLeaderboard.update({
                            challengeId: chal?.id,
                            plays: Sequelize.literal(`plays + 1`),
                            round: chal.round,
                            score: chal.score
                        },)
                    }
                }

                var leaderboard = await ChallengeLeaderboard.findAll({
                    attributes: {
                        include: [
                            [Sequelize.literal('ROW_NUMBER() OVER (ORDER BY "score" DESC)'), 'rank']
                        ],
                    },
                });

                var chal_rank = _.filter(leaderboard, (e) => {
                    return e.playerId == chal.playerId;
                });

                data.params["new_rank"] = chal_rank[0].dataValues.rank
                data.params["new_score"] = chal_rank[0].score


                lobby.broadcast(new DataEvent("chal_leader", "server"));
            }

            await chal.reload()


            data.event = 'end';
            data.params["challenge"] = chal.toJSON();


            this.conn[data.sender]?.send(JSON.stringify(data));
        });
    }

    async connect(ws: WebSocket, user: User, data: DataEvent) {
        this.conn[user.id] = ws;
        ws.send(JSON.stringify(data));
    }

    async disconnect(id: string) {
        this.conn[id]?.close();
        delete this.conn[id];
    }
}

let challengeArena = new ChallengeArenaManager();



class LobbyManager {
    wss = new WebSocketServer({ noServer: true, path: '/lobby' });
    conn: { [id: string]: WebSocket } = {};

    connect(ws: WebSocket, user: User) {
        this.conn[user.id] = ws;
        this.broadcast(new DataEvent("join", user.id, user));
    }

    disconnect(id: string) {
        this.broadcast(new DataEvent("leave", id, { 'id': id }));
        this.conn[id]?.close();
        delete this.conn[id];
    }

    broadcast(data: DataEvent, self: boolean = false) {
        Object.entries(this.conn).forEach((k, v) => {
            if (self) {
                if (k[1].readyState === WebSocket.OPEN) {
                    k[1].send(JSON.stringify(data));
                }
            } else {
                if (k[0] != data.sender && k[1].readyState === WebSocket.OPEN) {
                    k[1].send(JSON.stringify(data));
                }
            }
        });
    }
}

let lobby = new LobbyManager();


// Setup database
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: './db.sqlite',
    models: [User, Match, Challenge, Question, ChallengeLeaderboard, MatchLeaderboard],
    logging: false,
});


try {
    await sequelize.authenticate();
    await sequelize.sync();

    // Membuat 2 pilihan jawaban yang salah secara acak berdasarkan jawaban yang benar secara otomatis sebelum model Question terbuat
    Question.beforeSave((question, options) => {
        question.answer = evaluate(`${question.num1}${question.op}${question.num2}`)

        for (let i = 0; i < 2; i++) {
            var temp_op = q.getOp(question.difficulty);
            var temp_nump = q.roll_dice();

            // Jika operasi hitung pembagian, maka angka pembagi dibuat agar dapat menghasilkan nilai bilangan bulat atau ubah jadi operasi tambah jika tidak angka yang memungkinkan 
            if (temp_op == '/') {
                var n2 = _.range(2, question.answer + 1);

                if (_.isEmpty(n2)) {
                    temp_op = '+';
                } else {
                    var temp_filter = _.filter(n2, (e) => {
                        return question.answer % e == 0;
                    });
                    var p = Math.round(q.randomNumberG(0, temp_filter.length - 1));
                    p = _.clamp(p, 0, temp_filter.length - 1)
                    temp_nump = temp_filter[p];
                }
            }


            question.wrong.push(evaluate(`${question.answer}${temp_op}${temp_nump}`))


            // Cek agar setiap pilihan jawaban unik
            if (question.wrong[0] == question.wrong[1]) {
                question.wrong[0] += 2
            }
            if (question.wrong[0] == question.answer) {
                question.wrong[0] += 2
            }
            if (question.wrong[1] == question.answer) {
                question.wrong[1] += 2
            }
        }
    });

    console.log('Connection has been established successfully.');
} catch (error) {
    console.error('Unable to connect to the database:', error);
}

//Setup server
const app = express();
app.use(cors())
const server = createServer(app);

await User.findOrCreate({ where: { id: '0' }, defaults: { name: "COM", decorator: 0 } })

app.get('/', (req, res) => {
    res.send('<h1>Hello world</h1>');
});

app.get('/user', async (req, res) => {
    var id = req.query.id as string;

    var user = await User.findByPk(id, { include: [MatchLeaderboard, ChallengeLeaderboard] });

    if (user != null) {
        res.json(user.toJSON());
    } else {
        res.sendStatus(404);
    }
});

app.get('/create', async (req, res) => {
    let name = req.query.name as string;

    var id = uuidv4();

    var user = await User.create({
        id: id,
        name: name, decorator: Math.floor(Math.random() * 1000),
        matchLeaderboard: { playerId: id }
    },
        {
            include: [MatchLeaderboard]
        });

    if (user != null) {
        res.json(user.toJSON());
    } else {
        res.sendStatus(500);
    }
});

app.get('/online', async (req, res) => {
    var offset = Number(req.query.offset as string);
    var limit = Number(req.query.limit as string);


    if (isNaN(offset)) {
        offset = 0
    }
    if (isNaN(limit)) {
        limit = 10
    }

    var results: User[] = await User.findAll({
        where: Sequelize.or({ id: Object.keys(lobby.conn) }),
        attributes: { exclude: ['wins', 'loses', 'draws', 'plays'] },
        offset: offset,
        limit: limit,
    });

    res.json(results);
});

app.get('/match_leader', async (req, res) => {
    var offset = Number(req.query.offset as string);
    var limit = Number(req.query.limit as string);

    if (isNaN(offset)) {
        offset = 0
    }
    if (isNaN(limit)) {
        limit = 10
    }

    var leaderboard = await MatchLeaderboard.findAll({
        where: { plays: { [Op.not]: 0, } },
        attributes: {
            include: [
                [Sequelize.literal('ROW_NUMBER() OVER (ORDER BY "rating" DESC)'), 'rank']
            ]
        },

        include: [{ model: User, attributes: ['id', 'name', 'decorator'] }],
    });

    res.send(leaderboard);
});

app.get('/chal_leader', async (req, res) => {
    var offset = Number(req.query.offset as string);
    var limit = Number(req.query.limit as string);

    if (isNaN(offset)) {
        offset = 0
    }
    if (isNaN(limit)) {
        limit = 10;
    }

    var leaderboard = await ChallengeLeaderboard.findAll({
        attributes: {
            include: [
                [Sequelize.literal('ROW_NUMBER() OVER (ORDER BY "score" DESC)'), 'rank']
            ]
        },

        include: [{ model: User, attributes: ['id', 'name', 'decorator'] }],
    });

    res.send(leaderboard);
});

app.get('/user_chal', async (req, res) => {
    var id = req.query.id;
    var offset = Number(req.query.offset as string);
    var limit = Number(req.query.limit as string);

    if (isNaN(offset)) {
        offset = 0
    }
    if (isNaN(limit)) {
        limit = 10
    }

    // var challenges = await Challenge.findAll({
    //     offset: offset,
    //     limit: limit,
    //     attributes: {
    //         include: [
    //             [Sequelize.fn('MAX', Sequelize.col('score')), 'score'],
    //             [Sequelize.literal('ROW_NUMBER() OVER (ORDER BY "score" DESC)'), 'rank']
    //         ],
    //     },
    //     group: ["playerId"],
    //     where: {
    //         round: { [Op.not]: 0 },
    //         playerId: id
    //     },
    //     include: [{ model: User, attributes: ['id', 'name', 'decorator'] }],
    // });

    var chal = await Challenge.findByPk('7eab443c-ca21-487c-8c0e-aa880c65474c');

    //187ba9ee-0459-429a-8909-6e3e2b6d61e7
    //9efe1b4e-429e-439d-9a5a-1141ca6972e7

    var challenges = await Challenge.findAll({
        offset: offset,
        limit: limit,
        attributes: {
            include: [
                [Sequelize.fn('MAX', Sequelize.col('score')), 'score'],
                [Sequelize.literal('ROW_NUMBER() OVER (ORDER BY "score" DESC)'), 'rank']
            ],
        },
        group: ["playerId"],
        where: {
            round: { [Op.not]: 0 },
        },
        include: [{ model: User, attributes: ['id', 'name', 'decorator'] }],
    });

    challenges = _.filter(challenges, (e) => {
        return e.playerId == '';
    });

    console.log(challenges[0])

    res.send('');
});

app.get('/highest_chal', async (req, res) => {
    var id = req.query.id
    var offset = Number(req.query.offset as string);
    var limit = Number(req.query.limit as string);

    if (isNaN(offset)) {
        offset = 0
    }
    if (isNaN(limit)) {
        limit = 10
    }

    var challenges = await Challenge.findAll({
        where: { playerId: id },
        offset: offset,
        limit: limit,
        attributes: {
            include: [
                [Sequelize.literal('RANK() OVER (ORDER BY "score" DESC)'), 'rank']
            ]
        },
    });

    var max_chal = _.maxBy(challenges, 'score');


    res.send(max_chal?.toJSON());
});


app.get('/vscom', async (req, res) => {
    var id = req.query.id;

    var match = await Match.create({ id: uuidv4(), player1Id: id, player2Id: "0" });

    res.send(match.toJSON());
});

app.get('/create_challenge', async (req, res) => {
    var id = req.query.id;

    var challenge = await Challenge.create({ id: uuidv4(), playerId: id });

    res.send(challenge.toJSON());
});



app.get('/test', async (req, res) => {

    var a = await Match.create({ id: uuidv4(), player1Id: "08851ff9-4906-4094-bc6a-bca7e6434a8d", player2Id: "b1e1ad59-a6e2-418a-bfff-829ca38623a2", }, { include: [{ model: User, as: "player1" }] });

    var p1 = (await a.$get("player1", { include: [MatchLeaderboard] }))?.toJSON()

    a = a.toJSON()

    a.player1 = p1

    console.log(a)

    res.send(a)
});


server.listen(3000, () => {
    console.log('listening on *:3000')
});

// Karena tujuan websocket berada di port yang sama ({noServer: true}), maka request koneksi websocket diproses secara manual dan cek ketika request koneksi websocket diterima lalu proses dan alihkan ke websocket bersangkutan
server.on('upgrade', async function upgrade(req, socket, head) {
    var url = new URL(req.url!, `http://${req.headers.host}`);

    var id = url.searchParams.get('id');

    if (id != null) {
        var user = await User.findByPk(id);

        if (user != null) {
            var room = url.pathname;
            if (room == '/lobby') {
                lobby.wss.handleUpgrade(req, socket, head, (ws) => {
                    lobby.wss.emit("connection", ws, req, user);
                });
            } else if (room == '/mm') {
                mm.wss.handleUpgrade(req, socket, head, (ws) => {
                    mm.wss.emit("connection", ws, req, user);
                });
            } else if (room == '/arena') {
                var match_id = url.searchParams.get('match_id');
                if (match_id != null) {
                    var match = await Match.findByPk(match_id, { plain: true });
                    if (match != null) {
                        vsarena.wss.handleUpgrade(req, socket, head, (ws) => {
                            vsarena.wss.emit("connection", ws, req, user, match);
                        });
                    } else {
                        console.log("Match error")
                        socket.write('HTTP/1.1 404\r\n' +
                            'Message: Match ID Not Found\r\n' +
                            '\r\n');
                        socket.destroy();
                    }
                } else {
                    console.log("Match ID error")
                    socket.write('HTTP/1.1 400\r\n' +
                        'Message: Match ID was not passed in query\r\n' +
                        '\r\n');
                    socket.destroy()
                }


            } else if (room == '/challenge') {
                var challenge_id = url.searchParams.get('challenge_id');
                if (challenge_id != null) {
                    var challenge = await Challenge.findByPk(challenge_id, { plain: true });
                    if (challenge != null) {
                        challengeArena.wss.handleUpgrade(req, socket, head, (ws) => {
                            challengeArena.wss.emit("connection", ws, req, user, challenge);
                        });
                    } else {
                        console.log("Challenge error")
                        socket.write('HTTP/1.1 404\r\n' +
                            'Message: Challenge ID Not Found\r\n' +
                            '\r\n');
                        socket.destroy();
                    }
                } else {
                    console.log("Challenge ID error")
                    socket.write('HTTP/1.1 400\r\n' +
                        'Message: Challenge ID was not passed in query\r\n' +
                        '\r\n');
                    socket.destroy()
                }


            } else {
                console.log("Pathname error")
                socket.write('HTTP/1.1 400\r\n' +
                    'Message: Unexpected Pathname\r\n' +
                    '\r\n');
                socket.destroy();
            }

        } else {
            console.log("User error")
            socket.write('HTTP/1.1 404\r\n' +
                'Message: User ID Not Found\r\n' +
                '\r\n');
            socket.destroy();
        }
    } else {
        console.log("User ID error")
        socket.write('HTTP/1.1 400\r\n' +
            'Message: ID was not passed in query\r\n' +
            '\r\n');
        socket.destroy()
    }

});

lobby.wss.on('connection', function connection(ws, req, ...args: User[]) {
    (ws as any).isAlive = true;

    ws.on('error', console.error);

    ws.on('message', function message(data) {
        if (data.toString() == "pong") {
            (ws as any).isAlive = true;
        }
    });

    ws.on("close", function close() {
        lobby.disconnect(user.id);
    });

    const int = setInterval(function ping() {
        if ((ws as any).isAlive == false) {
            ws.terminate();
            lobby.disconnect(user.id);
            clearInterval(int);
        }
        (ws as any).isAlive = false;
        ws.send(JSON.stringify(new DataEvent("ping", "server")));
    }, 15000);

    var user = args[0];

    lobby.connect(ws, user);
});

mm.wss.on('connection', function connection(ws, req, ...args: User[]) {
    var user = args[0];

    ws.on('error', console.error);

    ws.on('message', function message(data) {
        var json_data = JSON.parse(data.toString());
        var data_event = new DataEvent(json_data["event"], user?.id, json_data["params"])
        mm.eventEmitter.emit(data_event.event, data_event);

    });

    ws.on("close", function close() {
        mm.disconnect(user.id);
    });

    mm.connect(ws, user);
});


vsarena.wss.on('connection', function connection(ws, req, ...args: User[] | Match[]) {
    var user = args[0] as User;
    var match = args[1] as Match;

    ws.on('error', console.error);

    ws.on('message', function message(data) {
        var json_data = JSON.parse(data.toString());
        var data_event = new DataEvent(json_data["event"], user.id, json_data["params"])
        if (match != null) {
            data_event.params["match"] = match;
        }
        vsarena.eventEmitter.emit(data_event.event, data_event);

    });

    ws.on("close", function close() {
        vsarena.disconnect(user.id);
    });

    vsarena.connect(ws, user);
});

challengeArena.wss.on('connection', async function connection(ws, req, ...args: User[] | Challenge[]) {
    var user = args[0] as User;
    var challenge = args[1] as Challenge;

    var leaderboard = await ChallengeLeaderboard.findAll({
        attributes: {
            include: [
                [Sequelize.literal('ROW_NUMBER() OVER (ORDER BY "score" DESC)'), 'rank']
            ],
        },
    });

    var chal_rank = _.filter(leaderboard, (e) => {
        return e.playerId == user.id;
    });

    var cur_rank = 0;
    var cur_score = 0;

    if (!_.isEmpty(chal_rank)) {
        cur_rank = chal_rank[0].dataValues.rank
        cur_score = chal_rank[0].score
    }

    var data_event = new DataEvent('', user.id)
    data_event.event = "connected"
    data_event.params["cur_rank"] = cur_rank;
    data_event.params["cur_score"] = cur_score;
    data_event.params["challenge"] = challenge;

    ws.on('error', console.error);

    ws.on('message', function message(data) {
        var json_data = JSON.parse(data.toString())

        data_event.event = json_data["event"];
        Object.entries(json_data["params"]).forEach((value, index) => {
            data_event.params[value[0]] = value[1]
        });

        challengeArena.eventEmitter.emit(data_event.event, data_event);

    });

    ws.on("close", function close() {
        challengeArena.disconnect(user.id);
    });

    challengeArena.connect(ws, user, data_event);
});
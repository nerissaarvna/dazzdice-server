import { evaluate, isPrime } from 'mathjs';
import _ from 'lodash';
import { Question } from './models.js';

var op15 = ['+', '-', '*', '/', '^', 'nthRoot'];
var op13 = ['+', '-', '*', '/', '^'];
var op6 = ['+', '-', '*', '/'];
var op1 = ['+', '-',];

class QuestionData {
    difficulty: number;
    num1: number;
    op: string;
    num2: number;
    answer: number;
    wrong: number[] = [];

    constructor(dif: number, num1: number, op: string, num2: number) {
        this.difficulty = dif;
        this.num1 = num1;
        this.op = op;
        this.num2 = num2;

        this.answer = evaluate(`${num1}${op}${num2}`)

        for (let i = 0; i < 2; i++) {
            var temp_op = getOp(dif);
            var temp_nump = roll_dice();

            if (temp_op == '/') {
                var n2 = _.range(2, this.answer + 1);

                if (_.isEmpty(n2)) {
                    temp_op = '+'
                } else {
                    var temp_filter = _.filter(n2, (e) => {
                        return this.answer % e == 0;
                    });
                    var p = Math.round(randomNumberG(0, temp_filter.length - 1));
                    p = _.clamp(p, 0, temp_filter.length - 1)
                    temp_nump = temp_filter[p];
                }
            }


            this.wrong.push(evaluate(`${this.answer}${temp_op}${temp_nump}`))
        }
    }
}

/**
 * Menghasilkan angka dari range yang ditentukan dengan chance/kemungkinan/probabilitas berdasarkan distribusi yang ditentukan.
 * 
 * Contoh:
 * 
 * Dengan range angka [0-100], mu = 0.55, sigma = 0.75 dan nsamples = 5,
 * maka dengan melakukan 1000x pemanggilan fungsi maka dihasilkan pendistribusian berikut:
 * - percobaan ke-1: { 'nilai <25': 77x, 'nilai 26-50': 340, 'nilai 51-75': 435x, 'nilai >75': 148x }
 * - percobaan ke-2: { 'nilai <25': 71x, 'nilai 26-50': 360, 'nilai 51-75': 435x, 'nilai >75': 134x }
 * - percobaan ke-3: { 'nilai <25': 63x, 'nilai 26-50': 368, 'nilai 51-75': 457x, 'nilai >75': 112x }
 * 
 * Dimodifikasi dari:
 * 
 * https://stackoverflow.com/a/33567961
 *
 */
export function randomNumberG(min: number = 0, max: number = 100, mu: number = 0.55, sigma: number = 0.75, nsamples: number = 5): number {
    var run_total = 0;
    for (var i = 0; i < nsamples; i++) {
        run_total += Math.random();
    }
    var n = sigma * (run_total - nsamples / 2) / (nsamples / 2) + mu;

    return n * max + min;
}

export function roundedRandomNumberG(min: number = 0, max: number = 100, mu: number = 0.55, sigma: number = 0.75, nsamples: number = 5): number {
    return Math.round(randomNumberG(min, max, mu, sigma, nsamples));
}

export function getOp(dif: number): string {
    if (dif < 6) {
        return _.sample(op1)!
    } else if (dif >= 6 && dif < 13) {
        return _.sample(op6)!
    } else if (dif >= 13) {
        return _.sample(op13)!
    } else {
        return '+'
    }
}

function getQuestM(dif: number, op: string) {
    var num1 = 0;
    var num2 = 0;

    if (op == '+') {
        if (dif < 3) {
            num1 = roundedRandomNumberG(0, 10);
            num2 = roundedRandomNumberG(0, 10);
        } else if (dif >= 3 && dif < 6) {
            num1 = roundedRandomNumberG(0, 25);
            num2 = roundedRandomNumberG(0, 25);
        } else if (dif >= 6 && dif < 9) {
            num1 = roundedRandomNumberG(0, 50);
            num2 = roundedRandomNumberG(0, 50);
        } else if (dif >= 9 && dif < 13) {
            num1 = roundedRandomNumberG(0, 100);
            num2 = roundedRandomNumberG(0, 100);
        } else if (dif >= 13 && dif < 17) {
            num1 = roundedRandomNumberG(0, 500);
            num2 = roundedRandomNumberG(0, 500);
        } else if (dif > 17) {
            num1 = roundedRandomNumberG(0, 1000);
            num2 = roundedRandomNumberG(0, 1000);
        }
    } else if (op == '-') {
        if (dif < 3) {
            num1 = roundedRandomNumberG(0, 10);
            num2 = roundedRandomNumberG(0, num1);
        } else if (dif >= 3 && dif < 6) {
            num1 = roundedRandomNumberG(0, 25);
            num2 = roundedRandomNumberG(0, num1);
        } else if (dif >= 6 && dif < 9) {
            num1 = roundedRandomNumberG(0, 50);
            num2 = roundedRandomNumberG(0, num1);
        } else if (dif >= 9 && dif < 13) {
            num1 = roundedRandomNumberG(0, 75);
            num2 = roundedRandomNumberG(0, num1);
        } else if (dif >= 13 && dif < 17) {
            num1 = roundedRandomNumberG(0, 100);
            num2 = roundedRandomNumberG(0, 100);
        } else if (dif > 17) {
            num1 = roundedRandomNumberG(0, 250);
            num2 = roundedRandomNumberG(0, 250);
        }
    } else if (op == '*') {
        if (dif >= 6 && dif < 9) {
            num1 = roundedRandomNumberG(0, 10);
            num2 = roundedRandomNumberG(0, 10);
        } else if (dif >= 9 && dif < 13) {
            num1 = roundedRandomNumberG(0, 20);
            num2 = roundedRandomNumberG(0, 20);
        } else if (dif >= 13 && dif < 17) {
            num1 = roundedRandomNumberG(0, 35);
            num2 = roundedRandomNumberG(0, 35);
        } else if (dif > 17) {
            num1 = roundedRandomNumberG(0, 50);
            num2 = roundedRandomNumberG(0, 50);
        }
    } else if (op == '/') {
        if (dif >= 6 && dif < 9) {
            var n1 = _.range(1, 35);
            var temp1 = _.filter(n1, (e) => {
                var p = randomNumberG(0, 1, 0.5, 1);
                return p > 0.75 || !isPrime(e);
            });

            var p1 = Math.round(randomNumberG(0, temp1.length - 1, 0.625));
            p1 = _.clamp(p1, 0, temp1.length - 1)
            num1 = temp1[p1];

            var n2 = _.range(1, num1 + 1);

            var temp2 = _.filter(n2, (e) => {
                return num1 % e == 0;
            });
            var p2 = Math.round(randomNumberG(0, temp2.length - 1));
            p2 = _.clamp(p2, 0, temp2.length - 1)
            num2 = temp2[p2];

            if (!num2) {
                num2 = _.sample(n1)!
            }
        } else if (dif >= 9 && dif < 13) {
            var n1 = _.range(0, 60);
            var temp1 = _.filter(n1, (e) => {
                var p = randomNumberG(0, 1, 0.5, 1);
                return p > 0.75 || !isPrime(e);
            });

            var p1 = Math.round(randomNumberG(0, temp1.length - 1, 0.625));
            p1 = _.clamp(p1, 0, temp1.length - 1)
            num1 = temp1[p1];

            var n2 = _.range(1, num1 + 1);

            var temp2 = _.filter(n2, (e) => {
                return num1 % e == 0;
            });
            var p2 = Math.round(randomNumberG(0, temp2.length - 1));
            p2 = _.clamp(p2, 0, temp2.length - 1)
            num2 = temp2[p2];

            if (!num2) {
                num2 = _.sample(n1)!
            }
        } else if (dif >= 13 && dif < 17) {
            var n1 = _.range(0, 100);
            var temp1 = _.filter(n1, (e) => {
                var p = randomNumberG(0, 1, 0.5, 1);
                return p > 0.75 || !isPrime(e);
            });

            var p1 = Math.round(randomNumberG(0, temp1.length - 1, 0.625));
            p1 = _.clamp(p1, 0, temp1.length - 1)
            num1 = temp1[p1];

            var n2 = _.range(1, num1 + 1);

            var temp2 = _.filter(n2, (e) => {
                return num1 % e == 0;
            });
            var p2 = Math.round(randomNumberG(0, temp2.length - 1));
            p2 = _.clamp(p2, 0, temp2.length - 1)
            num2 = temp2[p2];

            if (!num2) {
                num2 = _.sample(n1)!
            }
        } else if (dif > 17) {
            var n1 = _.range(0, 150);
            var temp1 = _.filter(n1, (e) => {
                var p = randomNumberG(0, 1, 0.5, 1);
                return p > 0.75 || !isPrime(e);
            });

            var p1 = Math.round(randomNumberG(0, temp1.length - 1, 0.625));
            p1 = _.clamp(p1, 0, temp1.length - 1)
            num1 = temp1[p1];

            var n2 = _.range(1, num1 + 1);

            var temp2 = _.filter(n2, (e) => {
                return num1 % e == 0;
            });
            var p2 = Math.round(randomNumberG(0, temp2.length - 1));
            p2 = _.clamp(p2, 0, temp2.length - 1)
            num2 = temp2[p2];

            if (!num2) {
                num2 = _.sample(n1)!
            }
        }
    } else if (op == '^') {
        if (dif >= 13 && dif < 15) {
            num1 = roundedRandomNumberG(0, 10);
            num2 = roundedRandomNumberG(0, 2);
        } else if (dif >= 15 && dif < 17) {
            num1 = roundedRandomNumberG(0, 15);
            num2 = roundedRandomNumberG(0, 2);
        } else if (dif >= 17 && dif < 19) {
            num1 = roundedRandomNumberG(0, 20);
            if (num1 < 10) {
                num2 = roundedRandomNumberG(0, 3);
            } else {
                num2 = roundedRandomNumberG(0, 2);
            }
            num2 = roundedRandomNumberG(0, 2);
        } else if (dif > 19) {
            num1 = roundedRandomNumberG(0, 25);
            if (num1 < 15) {
                num2 = roundedRandomNumberG(0, 3);
            } else {
                num2 = roundedRandomNumberG(0, 2);
            }
        }
    } else if (op == 'nthRoot') {
        if (dif >= 13 && dif < 15) {
            num1 = roundedRandomNumberG(0, 50);
            num2 = roundedRandomNumberG(0, 2);
        } else if (dif >= 15 && dif < 17) {
            num1 = roundedRandomNumberG(0, 100);
            num2 = roundedRandomNumberG(0, 2);
        } else if (dif >= 17 && dif < 19) {
            num1 = roundedRandomNumberG(0, 300);
            if (num1 < 10) {
                num2 = roundedRandomNumberG(0, 3);
            } else {
                num2 = roundedRandomNumberG(0, 2);
            }
            num2 = roundedRandomNumberG(0, 2);
        } else if (dif > 19) {
            num1 = roundedRandomNumberG(0, 500);
            if (num1 < 15) {
                num2 = roundedRandomNumberG(0, 3);
            } else {
                num2 = roundedRandomNumberG(0, 2);
            }
        }
    }

    return [num1, op, num2]

}

function getEval(num1: number, op: string, num2: number) {
    if (op == 'nthRoot') {
        return evaluate(`${op}(${num1},${num2})`);
    } else {
        return evaluate(`${num1}${op}${num2}`);
    }
}

export function roll_dice(max_n: number = 6): number {
    return Math.floor((Math.random() * max_n) + 1)
}

export function getQuestDice(dif: number) {
    var op: string = getOp(dif);

    var n1 = roll_dice();
    var n2 = roll_dice();

    if (op == '/') {
        var temp_n = _.range(1, n1 + 1);

        var temp_filter = _.filter(temp_n, (e) => {
            return n1 % e == 0;
        });
        var p = Math.round(randomNumberG(0, temp_filter.length - 1));
        p = _.clamp(p, 0, temp_filter.length - 1)
        n2 = temp_filter[p];

        if (!n2) {
            op = '+'
        }
    }

    return Question.build({ difficulty: dif, num1: n1, num2: n2, op: op });
}
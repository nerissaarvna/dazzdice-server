import _ from 'lodash';
import { Question } from './models.js';

var op15 = ['+', '-', '*', '/', '^', 'nthRoot'];
var op13 = ['+', '-', '*', '/', '^'];
var op6 = ['+', '-', '*', '/'];
var op1 = ['+', '-',];

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

// Mengasilkan operator berdasarkan variable dif
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

// Menghasilkan 1 nilai roll dadu
export function roll_dice(max_n: number = 6): number {
    return Math.floor((Math.random() * max_n) + 1)
}

// Menghasilkan data pertanyaan berdasarkan variable dif
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
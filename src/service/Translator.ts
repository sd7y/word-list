import {Word} from '../bo/Word'
export interface Translator {
    translate(source: string, from: string, to: string): Word;
}
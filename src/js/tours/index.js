// tours/index.js — 導覽註冊表
// #U08 導覽功能 (Onboarding & Feature Tour)
// 匯入所有導覽配置，匯出統一 TOURS 註冊表供 TourManager 使用。
import { welcomeTour } from './welcomeTour.js'
import { basicGuideTour } from './basicGuideTour.js'
import { statisticsTour } from './statisticsTour.js'
import { recurringTour } from './recurringTour.js'
import { ledgersTour } from './ledgersTour.js'
import { budgetTour } from './budgetTour.js'

export const TOURS = {
    welcome: welcomeTour,
    basics: basicGuideTour,
    statistics: statisticsTour,
    recurring: recurringTour,
    ledgers: ledgersTour,
    budget: budgetTour,
}

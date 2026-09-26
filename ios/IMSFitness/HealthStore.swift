import Foundation
#if canImport(HealthKit)
import HealthKit

@MainActor final class HealthStore: ObservableObject {
    @Published var syncState = "Not connected"
    private let store = HKHealthStore()
    private let calendar = Calendar(identifier: .gregorian)
    private var readTypes: Set<HKObjectType> {
        var set:Set<HKObjectType>=[HKObjectType.workoutType()]
        [HKQuantityTypeIdentifier.stepCount,.activeEnergyBurned,.appleExerciseTime,.bodyMass].compactMap{HKQuantityType.quantityType(forIdentifier:$0)}.forEach{set.insert($0)}
        if let sleep=HKObjectType.categoryType(forIdentifier:.sleepAnalysis){set.insert(sleep)}
        return set
    }
    func connectAndSync() async {
        guard HKHealthStore.isHealthDataAvailable() else {syncState="Apple Health unobserved";return}
        do {
            try await store.requestAuthorization(toShare:[],read:readTypes)
            syncState="Syncing observed Health data…"
            try await syncRecent(days:14)
            syncState="Apple Health connected"
        } catch { syncState="Health sync unobserved" }
    }
    private func syncRecent(days:Int) async throws {
        let now=Date(), start=calendar.date(byAdding:.day,value:-(days-1),to:calendar.startOfDay(for:now))!
        for offset in 0..<days {
            guard let day=calendar.date(byAdding:.day,value:offset,to:start) else{continue}
            try await sync(day:day)
        }
    }
    private func sum(_ id:HKQuantityTypeIdentifier,unit:HKUnit,start:Date,end:Date) async throws -> Double? {
        guard let type=HKQuantityType.quantityType(forIdentifier:id) else{return nil}
        let predicate=HKQuery.predicateForSamples(withStart:start,end:end,options:.strictStartDate)
        let result=try await withCheckedThrowingContinuation{(continuation:CheckedContinuation<Double?,Error>) in
            let query=HKStatisticsQuery(quantityType:type,quantitySamplePredicate:predicate,options:.cumulativeSum){_,stats,error in
                if let error{continuation.resume(throwing:error)}else{continuation.resume(returning:stats?.sumQuantity()?.doubleValue(for:unit))}
            };store.execute(query)
        };return result
    }
    private func latestWeight(start:Date,end:Date) async throws -> (Double?,String?) {
        guard let type=HKQuantityType.quantityType(forIdentifier:.bodyMass) else{return (nil,nil)}
        let predicate=HKQuery.predicateForSamples(withStart:start,end:end,options:.strictStartDate)
        return try await withCheckedThrowingContinuation{continuation in
            let query=HKSampleQuery(sampleType:type,predicate:predicate,limit:1,sortDescriptors:[NSSortDescriptor(key:HKSampleSortIdentifierEndDate,ascending:false)]){_,samples,error in
                if let error{continuation.resume(throwing:error);return}
                let sample=samples?.first as? HKQuantitySample
                continuation.resume(returning:(sample?.quantity.doubleValue(for:HKUnit.pound()),sample?.sourceRevision.source.name))
            };store.execute(query)
        }
    }
    private func sleepHours(start:Date,end:Date) async throws -> Double? {
        guard let type=HKObjectType.categoryType(forIdentifier:.sleepAnalysis) else{return nil}
        let predicate=HKQuery.predicateForSamples(withStart:calendar.date(byAdding:.hour,value:-12,to:start),end:end,options:.strictEndDate)
        return try await withCheckedThrowingContinuation{continuation in
            let query=HKSampleQuery(sampleType:type,predicate:predicate,limit:HKObjectQueryNoLimit,sortDescriptors:nil){_,samples,error in
                if let error{continuation.resume(throwing:error);return}
                let asleep=(samples as? [HKCategorySample] ?? []).filter{s in
                    if #observed(iOS 16.0,*) { return [HKCategoryValueSleepAnalysis.asleepCore.rawValue,HKCategoryValueSleepAnalysis.asleepDeep.rawValue,HKCategoryValueSleepAnalysis.asleepREM.rawValue,HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue].contains(s.value) }
                    return s.value==HKCategoryValueSleepAnalysis.asleep.rawValue
                }.map{($0.startDate,$0.endDate)}.sorted{$0.0<$1.0}
                guard !asleep.isEmpty else{continuation.resume(returning:nil);return}
                var merged:[(Date,Date)]=[]
                for interval in asleep { if let last=merged.last,interval.0<=last.1 { merged[merged.count-1]=(last.0,max(last.1,interval.1)) } else { merged.append(interval) } }
                continuation.resume(returning:merged.reduce(0){$0+$1.1.timeIntervalSince($1.0)}/3600)
            };store.execute(query)
        }
    }
    private func workouts(start:Date,end:Date) async throws -> (Double?,Int?) {
        let predicate=HKQuery.predicateForSamples(withStart:start,end:end,options:.strictStartDate)
        return try await withCheckedThrowingContinuation{continuation in
            let query=HKSampleQuery(sampleType:.workoutType(),predicate:predicate,limit:HKObjectQueryNoLimit,sortDescriptors:nil){_,samples,error in
                if let error{continuation.resume(throwing:error);return};let values=samples as? [HKWorkout] ?? []
                continuation.resume(returning:values.isEmpty ? (nil,nil):(values.reduce(0){$0+$1.duration}/60,values.count))
            };store.execute(query)
        }
    }
    private func sync(day:Date) async throws {
        let start=calendar.startOfDay(for:day),end=calendar.date(byAdding:.day,value:1,to:start)!
        async let steps=sum(.stepCount,unit:.count(),start:start,end:end)
        async let energy=sum(.activeEnergyBurned,unit:.kilocalorie(),start:start,end:end)
        async let exercise=sum(.appleExerciseTime,unit:.minute(),start:start,end:end)
        async let weight=latestWeight(start:start,end:end)
        async let sleep=sleepHours(start:start,end:end)
        async let workout=workouts(start:start,end:end)
        let values=try await (steps,energy,exercise,weight,sleep,workout)
        var observed:[String]=[];if values.0 != nil{observed.append("steps")};if values.1 != nil{observed.append("active_energy")};if values.2 != nil{observed.append("exercise_minutes")};if values.3.0 != nil{observed.append("weight")};if values.4 != nil{observed.append("sleep")};if values.5.1 != nil{observed.append("workouts")}
        guard !observed.isEmpty else{return}
        let formatter=DateFormatter();formatter.calendar=calendar;formatter.locale=Locale(identifier:"en_US_POSIX");formatter.dateFormat="yyyy-MM-dd"
        var request=URLRequest(url:SessionStore.apiBaseURL.appending(path:"/api/mobile/health"));request.httpMethod="POST";request.setValue("application/json",forHTTPHeaderField:"Content-Type")
        request.httpBody=try JSONSerialization.data(withJSONObject:["day":formatter.string(from:start),"steps":values.0 as Any,"active_energy_kcal":values.1 as Any,"exercise_minutes":values.2 as Any,"weight_lb":values.3.0 as Any,"weight_source":values.3.1 as Any,"sleep_hours":values.4 as Any,"workout_minutes":values.5.0 as Any,"workout_count":values.5.1 as Any,"observed_types":observed,"time_zone":TimeZone.current.identifier,"utc_offset_minutes":TimeZone.current.secondsFromGMT(for:start)/60])
        let (_,response)=try await URLSession.shared.data(for:request);guard (response as? HTTPURLResponse)?.statusCode==200 else{throw URLError(.badServerResponse)}
    }
}
#endif

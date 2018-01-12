package main

import (
    "github.com/eencloud/goeen/eentime"
    "fmt"
    "net/http"
    "net"
    "encoding/json"
    "github.com/gorilla/mux"
    "time"
    "strings"
    "sort"
    "bytes"
)

var (
    PreviewFilter = "i=*:ETAG,PREV:PRFR&i=IMAG"
    EsnURLTemplate = "http://%s:9005/esn/%s/%s/%s?%s"
    EsnDomain = ".a.plumv.com"
    HdrMap = map[string]int { "ts": 0, "domain": 1, "event": 2, "esn": 3 }
    TypeMap = map[string]map[string] int {
        "WSPL:PREV": { "ets": 4 },
        "TAGM:ETAG": { "ets": 5, "etag": 4 },
        "OBSV:ETAG": { "ets": 5, "etag": 4 },
        "WSPL:ETAG": { "ets": 5, "etag": 4 },
        "IMAG:IMGS": { "ets": 4, "fail": 5 },
        "IMAG:IMGF": { "ets": 4, "fail": 5 },
        "IMAG:IMGE": { "ets": 4, "fail": 5 },
        "IMAG:IMKS": { "ets": 4, "kts": 5 },
        "IMAG:IMKE": { "ets": 4, "kts": 5, "fail": 6 }}
)

func respondJson(w http.ResponseWriter, js []byte){

    w.Header().Set("Content-Type", "application/json")
    fmt.Fprintln(w,"{\"response\": 200, \"message\": \"ok\", \"data\": "+string(js)+"}")
}

func errorJson(w http.ResponseWriter, code int, msg string){

    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(code)
    fmt.Fprintln(w,"{\"response\": %d, \"message\": \"%s\", \"data\": null}",code,msg)
}

func parseTimeArg( arg string) (time.Time, error) {
    now := time.Now()
    if(strings.HasPrefix(arg,"+") || strings.HasPrefix(arg,"-")){

        d,err := time.ParseDuration(arg[:])
        if  err != nil {
            print ("faild parsing duration"+arg);
            //XXX return and error here...
            return now.UTC(),err
        }
        return now.UTC().Add(d),nil
    }
    if(arg == "none" || arg == "" || arg=="now"){
        return now.UTC(),nil
    }
    return eentime.Parse(arg)
}

func resolveEsn(w http.ResponseWriter, r *http.Request) {
    vars := mux.Vars(r)
    //XXX make sure it looks like an esn...
    host := vars["esn"]+EsnDomain

    addrs,_ := net.LookupHost(host)

    js,_ := json.Marshal(addrs);
    respondJson(w,js)
}

func resolveEsnTimes(w http.ResponseWriter, r *http.Request) {
    vars := mux.Vars(r)
    //XXX make sure it looks like an esn...
    host := vars["esn"]+EsnDomain

    addrs,_ := net.LookupHost(host)

    start_t,_ := parseTimeArg(vars["start_ts"])
    end_t,_ := parseTimeArg(vars["end_ts"])


    start_ts := start_t.Format(eentime.TimeFormat)
    end_ts := end_t.Format(eentime.TimeFormat)

    var result bytes.Buffer
    enc := json.NewEncoder(&result)
    result.Write([]byte("{ \"addrs\": "))
    enc.Encode(addrs)

    result.Write([]byte(", \"start_ts_een\": "))
    enc.Encode(start_ts)
    result.Write([]byte(", \"end_ts_een\": "))
    enc.Encode(end_ts)

    result.Write([]byte(", \"end_ts\": "))
    enc.Encode(float64(end_t.UnixNano())/1000000000.0)

    result.Write([]byte(", \"start_ts\": "))
    enc.Encode(float64(start_t.UnixNano())/1000000000.0)

    result.Write([]byte("}"))


    respondJson(w,result.Bytes())
}


func txlogHostEsnPreviews(w http.ResponseWriter, r *http.Request) {
    vars := mux.Vars(r)
    host := vars["host"]
    esn := vars["esn"]

    start_t,_ := parseTimeArg(vars["start_ts"])
    end_t,_ := parseTimeArg(vars["end_ts"])
    if(start_t.After(end_t) || start_t.Equal(end_t)){
        errorJson(w,400,"invalid ts")
        return;
    }
    url := fmt.Sprintf(EsnURLTemplate,host,esn,
        start_t.Format(eentime.TimeFormat),
        end_t.Format(eentime.TimeFormat),
        PreviewFilter)

    res, err := http.Get(url)
    if err != nil {
        errorJson(w,500,"no response")
        return
    }
    defer res.Body.Close()
    dec := json.NewDecoder(res.Body)
    count := 0
    _, err = dec.Token()
    if err != nil {
        errorJson(w,500,"bad format")
        return
    }
    out := make(map[float64]map[string]float64,8000)
    keys :=  make([]float64,0,8000)
    for dec.More(){
        var row string
        err = dec.Decode(&row)
        if(err != nil){
            println ("failed row decode")
            break
        }
        fields := strings.Fields(row)
        tp := fields[HdrMap["domain"]]+":"+fields[HdrMap["event"]]
        if mp := TypeMap[tp]; mp != nil {
            time_ts,_ := eentime.Parse(fields[HdrMap["ts"]])
            time_float_ts := float64(time_ts.UnixNano())/1000000000.0
            event_ts,_ := eentime.Parse(fields[mp["ets"]])
            event_float_ts := float64(event_ts.UnixNano())/1000000000.0

            or := out[event_float_ts]
            if(or == nil){
                or = make(map[string]float64,10)
                out[event_float_ts] = or
                keys = append(keys,event_float_ts)
            }
            or[tp] = time_float_ts-event_float_ts
        }
        count += 1
    }
    sort.Float64s(keys)

    //var min_ts,max_ts float64 = -1,-1

    var result bytes.Buffer
    enc := json.NewEncoder(&result)
    result.Write([]byte("["))
    first := 1
    for _,v := range keys {
        if(first == 0) {
            result.Write([]byte(",\n"))
        }
        first = 0

        result.Write([]byte("["))
        enc.Encode(v)
        result.Write([]byte(", "))
        enc.Encode(out[v])
        result.Write([]byte("]"))
    }
    result.Write([]byte("]"))

    respondJson(w,result.Bytes())
}

func main() {
    r := mux.NewRouter()
    r.HandleFunc("/resolve/esn/times/{esn:[[:xdigit:]]{8}}/{start_ts}/{end_ts}", resolveEsnTimes)
    r.HandleFunc("/resolve/esn/{esn:[[:xdigit:]]{8}}", resolveEsn)
    r.PathPrefix("/static/").Handler(http.StripPrefix("/static/", http.FileServer(http.Dir("static"))))
    r.HandleFunc("/txlog/previews/hostesn/{host}/{esn:[[:xdigit:]]{8}}/{start_ts}/{end_ts}",txlogHostEsnPreviews)
    http.Handle("/",r)
    http.ListenAndServe(":1234", nil) 
}

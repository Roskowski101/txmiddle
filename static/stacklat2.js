/* concept here is we are passed in an svg element, esn, start and end
 *
 * we create our focus and ctxt svgs w.in the svg and return a StackLat object
 *
 * from there, pretty much everything should just work...
 */
var StackLatDefaultFields = [ "IMAG:IMGE", "IMAG:IMGF","IMAG:IMKE","IMAG:IMKS", "IMAG:IMGS","WSPL:PREV","TAGM:ETAG"];
function StackLatNew(prnt,id,host,esn,width,height,min_ts, max_ts,fields){
    var sl = {};
    var ctxt_ratio = 0.30;
    sl.focus_margin = {top: 20, right: 20, bottom: height*ctxt_ratio, left: 50};
    sl.ctxt_margin = {top: 20+height*(1.0-ctxt_ratio), right: 20, bottom: 20, left: 50};
    sl.prnt = prnt;
    sl.id = id;
    sl.host = host;
    sl.esn = esn

    sl.set_dimensions = function (width,height) {
        this.height = height;
        this.width = width - this.focus_margin.left - this.focus_margin.right;
        this.focus_height = height - this.focus_margin.top - this.focus_margin.bottom;
        this.ctxt_height = height - this.ctxt_margin.top - this.ctxt_margin.bottom;
    }
    sl.set_times = function(min_ts,max_ts){
        this.min_ts = min_ts;
        this.max_ts = max_ts;
        this.min_date = new Date(Math.floor(min_ts*1000));
        this.max_date = new Date(Math.floor(max_ts*1000));
    }

    sl.create = function(elem){
        this.svg = elem.append("svg").attr("width",this.width).attr("height",this.height).attr("id",this.id);
        this.focus = this.svg.append("g")
            .attr("class", "focus")
            .attr("id", this.id+"_focus")
            .attr("transform", "translate(" + this.focus_margin.left + "," + this.focus_margin.top + ")");

        this.clip = this.focus.append("defs").append("clipPath")
            .attr("id", this.id+"_clip")
            .append("rect")
            .attr("width", this.width)
            .attr("height", this.focus_height);

        this.ctxt = this.svg.append("g")
            .attr("class", "context")
            .attr("id", this.id+"_context")
            .attr("transform", "translate(" + this.ctxt_margin.left + "," + this.ctxt_margin.top + ")");

        this.focus_date_x = d3.scaleUtc().domain([this.min_date,this.max_date]).range([0,this.width]);
        this.focus_float_x = d3.scaleLinear()
            .domain([this.min_ts,this.max_ts])
            .range([0, this.width]);
        this.ctxt_date_x = d3.scaleUtc().domain([this.min_date,this.max_date]).range([0,this.width]);
        this.ctxt_float_x = d3.scaleLinear()
            .domain([this.min_ts,this.max_ts])
            .range([0, this.width]);

        this.focus_x_axis = d3.axisBottom(this.focus_date_x).tickFormat(d3.utcFormat("%Y%m%d%H%M%S.%L")).ticks(this.width/200);

        this.focus_y = d3.scaleLinear()
            .domain([0,10.0])
            .range([this.focus_height,0])
            .clamp(true);

        this.focus_y_axis = d3.axisLeft(this.focus_y);

        this.ctxt_y = d3.scaleLinear()
            .domain([0,10.0])
            .range([this.ctxt_height,0])
            .clamp(true);

        this.ctxt_x_axis = d3.axisBottom(this.ctxt_date_x).tickFormat(d3.utcFormat("%Y%m%d%H%M%S.%L")).ticks(this.width/200);

        this.zoom = d3.zoom()
            .scaleExtent([1, Infinity])
            .translateExtent([[0, 0], [this.width, this.focus_height]])
            .extent([[0, 0], [this.width, this.focus_height]])
            .on("zoom", this.zoomed);

        this.c20 = d3.scaleOrdinal(d3.schemeCategory20)
        this.legend = this.svg.append("g")
            .attr("font-family", "sans-serif")
            .attr("font-size", 10)
            .attr("text-anchor", "end")
            .attr("tranform","translate(" + (this.width-50) + ", 10)");

        this.title = this.svg.append("g")
            .attr("font-family", "sans-serif")
            .attr("font-size", 12)
            .attr("text-anchor", "start")
            .attr("tranform","translate(" + (this.focus_margin.left) + ", 10)")

        this.title.append("text")
                .attr("x", this.focus_margin.left)
                .attr("y", 9.5)
                .attr("dy", "0.32em")
                .text("Host: "+this.id);

        this.focus.append("g")
            .attr("class", "axis axis--x")
            .attr("transform", "translate(0," + this.focus_height + ")")
            .call(this.focus_x_axis);
        this.svg.append("g")
            .attr("class", "axis axis--y")
            .attr("transform","translate("+this.focus_margin.left+"," + this.focus_margin.top +")")
            .call(this.focus_y_axis);

        this.ctxt = this.svg.append("g")
            .attr("class", "ctxt")
            .attr("transform", "translate(" + this.ctxt_margin.left + "," + this.ctxt_margin.top + ")");

        this.ct_index = this.fields.length-1;
        this.ct_area = this.makeArea(this.fields[this.ct_index],this.ctxt_float_x,this.ctxt_y);
        this.ctxt.append("g")
            .attr("class", "axis axis--x")
            .attr("transform", "translate(0," + this.ctxt_height + ")")
            .call(this.ctxt_x_axis);

        /* set up the brush/zoom logic */
        this.brush = d3.brushX()
            .extent([[0, 0], [this.width, this.ctxt_height]])
            .on("brush end", this.brushed);

        this.ctxt.append("g")
            .attr("class", "brush")
            .call(this.brush)
            .call(this.brush.move, this.focus_date_x.range());

        this.svg.append("rect")
            .attr("class", "zoom")
            .attr("width", this.width)
            .attr("height", this.focus_height)
            .attr("transform", "translate(" + this.focus_margin.left + "," + this.focus_margin.top + ")")
            .call(this.zoom);

    }
    sl.makeArea = function (field,x,y){
        var area = d3.area()
            .x( function (d) { return x(d[0]); } )
            .y1( function (d) { 
                if(d[1].hasOwnProperty(field)) { 
                    return y(d[1][field]); 
                } else { 
                    return y(0);
                }})
            .y0( y(0) );
        return area;
    }

    sl.rescaleAreas = function (areas,node){
        node.selectAll(".area").remove();
        for (let e of areas.entries()) {
            node.append("path")
                .datum(this.data)
                .attr("class","area")
                .attr("clip-path","url(#"+this.id+"_clip)")
                .attr("d",e[1][1])
                .attr("fill",this.c20(e[0]));
        }
    }
    sl.zoomed = function () {
        if (d3.event.sourceEvent && d3.event.sourceEvent.type === "brush") return; // ignore zoom-by-brush
        var t = d3.event.transform;
        sl.focus_float_x.domain(t.rescaleX(sl.ctxt_float_x).domain());
        sl.focus_date_x.domain(t.rescaleX(sl.ctxt_date_x).domain());
        sl.focus.select(".axis--x").call(sl.focus_x_axis);
        sl.ctxt.select(".brush").call(sl.brush.move, sl.focus_float_x.range().map(t.invertX, t));
        sl.rescaleAreas(sl.areas,sl.focus);
    }

    sl.setData = function(data){
        this.data = data;
        this.render()
    }

    sl.render = function() {
        for (let e of this.areas.entries()) {
            this.focus.append("path")
                .datum(this.data)
                .attr("class","area")
                .attr("d",e[1][1])
                .attr("fill",this.c20(e[0]));
            this.legend.append("rect")
                .attr("x", this.width - 19)
                .attr("y", e[0]*20)
                .attr("width", 19)
                .attr("height", 19)
                .attr("fill", this.c20(e[0]));
            this.legend.append("text")
                .attr("x", this.width - 24)
                .attr("y", 9.5+e[0]*20)
                .attr("dy", "0.32em")
                .text(e[1][0]);
        }
        this.ctxt.append("path")
            .datum(this.data)
            .attr("class","area")
            .attr("d",this.ct_area)
            .attr("fill",this.c20(this.ct_index));

    }

    sl.brushed = function() {
        if (d3.event.sourceEvent && d3.event.sourceEvent.type === "zoom") return; // ignore brush-by-zoom
        var s = d3.event.selection || sl.ctxt_date_x.range();
        sl.focus_float_x.domain(s.map(sl.ctxt_float_x.invert, sl.ctxt_float_x));
        sl.focus_date_x.domain(s.map(sl.ctxt_date_x.invert, sl.ctxt_date_x));
        sl.rescaleAreas(sl.areas,sl.focus);
        sl.focus.select(".axis--x").call(sl.focus_x_axis);
        sl.svg.select(".zoom").call(sl.zoom.transform, d3.zoomIdentity .scale(sl.width / (s[1] - s[0])) .translate(-s[0], 0));
    }

    // now make it happen...
    sl.set_dimensions(width,height);
    sl.set_times(min_ts,max_ts);
    if(fields == null){
        sl.fields = StackLatDefaultFields;
    } else {
        sl.fields = fields;
    }

    var areas = [];
    sl.areas = areas;
    sl.create(prnt);
    var y = sl.focus_y(5.0);
    sl.fields.forEach( function(d) {
        sl.areas.push([d,sl.makeArea(d,sl.focus_float_x,sl.focus_y)]);
    });

    return sl;
}

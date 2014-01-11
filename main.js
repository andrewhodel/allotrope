var socket = Object;

if ($.cookie('allokey')) {
    doLogin($.cookie('allokey'));
}

$('#login').on("click", function (event) {
    event.preventDefault();
    doLogin($('#key').val());
});

$('#key').keydown(function (event) {
    if (event.which == 13) {
        event.preventDefault();
        doLogin($('#key').val());
    }
});

$('#logout').on("click", function (event) {
    event.preventDefault();
    $.removeCookie('allokey');
    window.location.reload();
});

$('#jsch').on("click", function (event) {
    event.preventDefault();
    $('#jsbox').show('fast', function () {
        var h = $('#jsbox').height() - 40;
        $('#editor').css('bottom', h * .2 + 60);
        $('#editortext').width($('#editor').width() - 10);
        $('#editortext').height($('#editor').height() - 70);
        $('#output').css('top', h * .8);
    });
});

$('#xjsbox').on("click", function (event) {
    event.preventDefault();
    $('#jsbox').hide('fast');
});

function doLogin(key) {

    socket = new io.connect('/', {
        //login
        query: 'key=' + key + '',
        'force new connection': true
    });
    socket.on('loginValid', function (data) {

        // login success
        $('#cover').hide('fast');
        $.cookie('allokey', key, {
            expires: 7
        });

    });

    socket.on('error', function (data) {

        $.removeCookie('allokey');
        alert('failed to login');

    });

    socket.on('update', function (data) {

        console.log('new update', data);

        // remove prior update
        $('#hash' + data.hash).remove();

        // check if color group exists
        if (!$('#color' + data.color).length) {
            console.log('creating color group ' + data.color);
            $('#updates').prepend('<div id="color' + data.color + '" class="colorGroup" style="background-color: ' + data.color + ';">');
        }

        var h = '<div id="hash' + data.hash + '" class="update"></div>';

        //h += '<div class="title">' + data.title + '<a href="#" onclick="deleteOne(\'' + data.hash + '\'); return false;" style="float: right;">X</a></div>';

        //h += '<div class="hashtext" style="font-size: 12px;">' + data.title + ' : ' + data.data + ' : ' + data.ts + '</div>';

        if (data.alert) {
            //h += 'background-color: red;';
        }

        $('#color' + data.color).prepend(h);

        var margin = {
            top: 2,
            right: 2,
            bottom: 2,
            left: 2
        },
            width = $('#hash' + data.hash).width() - margin.left - margin.right,
            height = $('#hash' + data.hash).height() - margin.top - margin.bottom;

        console.log(data.hash, width, height);

        var svg = d3.select('#hash' + data.hash).insert("svg")

        // add text

        ttitle = svg.append('text').text(data.title + ' - ' + data.ts)
                        .attr('x', 4)
                        .attr('y', 14)
                        .attr("font-size", "12px")
                        .on("click", function(d){alert(data.hash)})
                        .attr('fill', 'black');

        tx = svg.append('text').text('x')
                        .attr('x', width-10)
                        .attr('y', height)
                        .attr("font-size", "26px")
                        .on("click", function(d){deleteOne(data.hash)})
                        .attr('fill', 'red');

        tdata = svg.append('text').text(data.data)
                        .attr('x', 4)
                        .attr('y', 34)
                        .attr("font-size", "24px")
                        .attr('fill', 'black');

        if (data.graph) {
            // draw 24h mini graph
            var dd = data.gdata;

            var x = d3.time.scale()
                .range([0, width]);

            var y = d3.scale.linear()
                .range([height, 0]);

            var xAxis = d3.svg.axis()
                .scale(x)
                .orient("bottom");

            var yAxis = d3.svg.axis()
                .scale(y)
                .orient("left");

            var valueline = d3.svg.line()
                .x(function (d) {
                    return x(d.ts);
                })
                .y(function (d) {
                    return y(d.d);
                });

            x.domain(d3.extent(dd, function (d) {
                return d.ts;
            }));
            y.domain(d3.extent(dd, function (d) {
                return d.d;
            }));

            svg.append("path")
                .attr("class", "line")
                .attr("d", valueline(dd));

            var tt = d3.select(".tooltip");
            var formatTime = function (ts) {
                var now = Math.round((new Date()).getTime() / 1000);
                return Math.round((now - ts) / 60 / 60) + ' hours ago';
            }

            svg.selectAll("dot")
                .data(dd)
                .enter().append("circle")
                .attr("r", 8)
                .style("fill", "none")
                .style("stroke", "none")
                .style("pointer-events", "all")
                .attr("cx", function (d) {
                    return x(d.ts);
                })
                .attr("cy", function (d) {
                    return y(d.d);
                })
                .on("mouseover", function (d) {
                    tt.transition()
                        .duration(200)
                        .style("opacity", .9);
                    tt.html(formatTime(d.ts) + "<br/><strong>" + d.d + '</strong>')
                        .style("left", (d3.event.pageX) + "px")
                        .style("top", (d3.event.pageY - 28) + "px");
                })
                .on("mouseout", function (d) {
                    tt.transition()
                        .duration(500)
                        .style("opacity", 0);
                });
        }

        //$('.ts').epochago();
    });

    setInterval("$('.ts').epochago()", 30000);

}

function deleteOne(hash) {
    $('#hash' + hash).remove();
    socket.emit('deleteOne', {
        hash: hash
    });
}

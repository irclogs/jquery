jQuery(function ($) {

   /* initialization */
   var current_channel;
   current_channel = $Utils.getCookie('irclog_channel') || "lugola";
   current_channel = $Utils.getQueryVariable("channel", current_channel);
   $Utils.setCookie('irclog_channel', current_channel, 3000);

   $('title').text('#' + current_channel + ' - IRClogger 2.0');

   var pagination = {begin: [current_channel, {}], end: [current_channel, 0] };

   var focused = false;
   $(window).focus(function () { focused = true; });
   $(window).blur(function () { focused = false; });

   $('#prev_page').click(loadPrevPage);
   $('#next_page').click(loadNextPage);
   $('#settings a').click(function() {
      TINY.box.show({url:this.href});
      return false;
   });

   var table = $("#irclog");
   var cachedTBodySegments = {};

   function timestampToDatetime(timestamp) {
      function pad(x)
         {return x < 10 ? '0' + x.toString() : x.toString()}

      var dt = new Date(timestamp * 1000);
      return {
         date: dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate()),
         time: pad(dt.getHours()) + ':' + pad(dt.getMinutes()) + ':' + pad(dt.getSeconds())
      }
   }

   function fmtMessage(doc, color) {
      var out = '';
      out += '<span class="nickname" style="background-color:' + color + '">' + doc.sender + '</span>';
      msg = $Utils.escapeHTML(doc.message);
      msg = $Utils.autoLink(msg);
      msg = msg.replace(/^\x01ACTION (.*)\x01/g, '<span class="nickname" style="background-color:' + color + '">$1</span>');
      out += '<span>' + msg + '</span>';
      return out;
   }

   function makeTableRow(message, permalink, anchor, datetime) {
      var out = '';
      out += '<tr>';
      out += '<td valign="top" class="timestamp" width="1%">';
      out += '<a id="' + anchor + '" href="' + permalink + '">' + datetime.time + '</a>';
      out += '</td>';
      out += '<td class="message">' + message + '</td>';
      out += '</tr>\n';
      return out;
   }

   function displayRows(rows, descending) {
      var i, len = rows.length;
      for (i=0; i<len; i++) {
         var doc = rows[i].doc;
         var color = $Colorizer(doc.sender);
         var datetime = timestampToDatetime(doc.timestamp);
         var permalink = '?channel=' + doc.channel +
                   ';date=' + datetime.date + '#' + datetime.time;
         var anchor = datetime.date + '-' + datetime.time;  // FIXME ???
         var msg = fmtMessage(doc, color);
         var row = makeTableRow(msg, permalink, anchor, datetime);
         var body = getTableSegment(datetime.date);
         if (descending) {
            $(body.children()[0]).after(row);
         } else {
            body.append(row);
         }
      }
   }

   function getTableSegment(date) {
      var tbody = cachedTBodySegments[date];
      if (tbody !== undefined)
         return tbody;
      tbody = $('<tbody>');
      tbody.attr('id', date);
      cachedTBodySegments[date] = tbody;
      tbody.append('<tr><th class="date" colspan="2"><span>' + date + '</span></th></tr>');

      var bodies = table.children('tbody');
      var i, done = false;
      for (i=0; i<bodies.length; i++) {
         if (date < bodies[i].id) {
            $(bodies[i]).before(tbody);
            done = true;
            break;
         }
      }
      if (!done) table.append(tbody);

      return tbody;
   }


   function loadNextPage() {
      var v = $Couch.view("channel", {
         startkey: pagination.end,
         endkey: [current_channel, {}],
         include_docs: true,
         limit: 100,
         descending: false
      }).done(function (data) {
         pagination.end = data.rows[data.rows.length - 1].key;
         displayRows(data.rows);
      });
      return v;
   }


   function loadPrevPage() {
      var v = $Couch.view("channel", {
         startkey: pagination.begin,
         endkey: [current_channel, 0],
         include_docs: true,
         limit: 100,
         descending: true
      }).done(function (data) {
         pagination.begin = data.rows[data.rows.length - 1].key;
         displayRows(data.rows, true);
      });
      return v;
   }


   function loadFullDay(date) {
      var start = new Date(date).getTime() / 1000;
      var end = start + 24 * 60 * 60;
      var v = $Couch.view("channel", {
         startkey: [current_channel, start],
         endkey: [current_channel, end],
         include_docs: true,
         descending: false
      }).done(function (data) {
         pagination.begin = data.rows[0].key;
         pagination.end = data.rows[data.rows.length - 1].key;
         displayRows(data.rows);
      });
      return v;
   }

   // callback, called when new data arrives from the _changes notification feed
   function on_update(data) {
      displayRows(data.results);
      if (!focused) {
         $TitleAlert.start();
      } else if (document.documentElement.scrollHeight - 100 <
            document.documentElement.clientHeight + window.pageYOffset) {
         // view is at the bottom of the document, scroll down to the end
         window.scroll(window.scrollX, document.body.clientHeight);
      } else {
         $.noticeAdd({text: fmtMessage(doc)});
      }
   }

   function startUpdates(last_update_seq) {
      var query = {
         include_docs: "true",
         filter: "log/channel",
         channel: current_channel
      }
      var ch = $Couch.changes(last_update_seq, query);
      ch.on_change(on_update);
      ch.on_error(function (err, exc) {
         if (console && console.log)
            console.log(err, exc);
      });
      ch.start();
      return ch;
   }



   var date = $Utils.getQueryVariable("date");
   if (date) {
      loadFullDay(date);
   } else {
      $('#next_page').hide();
      loadPrevPage().done(function (data) {
         // setTimeout trick is to stop the browser loader spinning
         window.setTimeout(startUpdates, 1000, data.update_seq);
      });
   }

});

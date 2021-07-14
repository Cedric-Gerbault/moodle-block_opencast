// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Moodle is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <http://www.gnu.org/licenses/>.

/**
 * Javascript to initialise the opencast block settings.
 *
 * @package    block_opencast
 * @copyright  2021 Tamara Gunkel, University of Münster
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

import Tabulator from 'block_opencast/tabulator';
import $ from 'jquery';
import * as str from 'core/str';
import ModalFactory from 'core/modal_factory';
import ModalEvents from 'core/modal_events';
import Fragment from 'core/fragment';
import Ajax from 'core/ajax';
import Templates from 'core/templates';
import Notification from 'core/notification';

function getBody(contextid, ocinstanceid, formdata) {
    if (typeof formdata === 'undefined') {
        formdata = "";
    }

    var params = {ocinstanceid: ocinstanceid, jsonformdata: formdata};
    return Fragment.loadFragment('block_opencast', 'series_form', contextid, params);
}

function submitFormAjax(e) {
    e.preventDefault();
    var modal = e.data.modal;
    var contextid = e.data.contextid;
    var seriestable = e.data.seriestable;

    var changeEvent = document.createEvent('HTMLEvents');
    changeEvent.initEvent('change', true, true);

    // Run validation functions.
    modal.getRoot().find(':input').each(function (index, element) {
        element.dispatchEvent(changeEvent);
    });

    // Check if there are invalid fields.
    var invalid = $.merge(
        modal.getRoot().find('[aria-invalid="true"]'),
        modal.getRoot().find('.error')
    );

    if (invalid.length) {
        invalid.first().focus();
        return;
    }

    // Convert all the form elements values to a serialised string.
    var formData = modal.getRoot().find('form').serialize();

    // Submit form.
    Ajax.call([{
        methodname: 'block_opencast_submit_series_form',
        args: {contextid: contextid, ocinstanceid: e.data.ocinstanceid, jsonformdata: formData},
        done: function (newseries) {
            modal.destroy();
            if(seriestable !== undefined) {
                var s = JSON.parse(newseries);
                seriestable.addRow({'seriesname': s.seriestitle, 'series':s.series, 'isdefault': s.isdefault});
            }
        },
        fail: function () {
            modal.setBody(getBody(contextid, e.data.ocinstanceid, formData));
        }
    }]);
}

function loadSeriesTitles(contextid, ocinstanceid, series, seriestable, row) {
    Ajax.call([{
        methodname: 'block_opencast_get_series_titles',
        args: {contextid: contextid, ocinstanceid: ocinstanceid, series: JSON.stringify(series)},
        done: function (data) {
            var titles = JSON.parse(data);
            if (seriestable !== null) {
                seriestable.getRows().forEach(function (row) {
                    row.update({"seriesname": titles[row.getData().series]});
                });
            } else {
                row.update({"seriesname": titles[row.getData().series]});
            }

        },
        fail: function (error) {
            // Show error.
            if (seriestable !== null) {
                seriestable.getRows().forEach(function (row) {
                    row.update({"seriesname": error.message});
                });
            } else {
                row.update({"seriesname": error.message});
            }
        }
    }]);
}

export const init = (contextid, ocinstanceid, seriesinputname) => {

    // Load strings
    var strings = [
        {key: 'seriesname', component: 'block_opencast'},
        {key: 'form_seriesid', component: 'block_opencast'},
        {key: 'default', component: 'block_opencast'},
        {key: 'noconnectedseries', component: 'block_opencast'},
        {key: 'createseriesforcourse', component: 'block_opencast'},
        {key: 'delete_series', component: 'block_opencast'},
        {key: 'delete_confirm_series', component: 'block_opencast'},
        {key: 'editseries', component: 'block_opencast'},
        {key: 'delete', component: 'moodle'},
        {key: 'loading', component: 'block_opencast'},
        {key: 'importseries', component: 'block_opencast'},
        {key: 'importfailed', component: 'block_opencast'}

    ];
    str.get_strings(strings).then(function (jsstrings) {
        // Style hidden input.
        var seriesinput = $('input[name="' + seriesinputname + '"]');

        var seriestable = new Tabulator("#seriestable", {
            data: JSON.parse(seriesinput.val()),
            layout: "fitColumns",
            placeholder: jsstrings[3],
            headerSort: false,
            dataChanged: function (data) {
                // Remove empty rows.
                data = data.filter(value => value.series);
                data = data.reduce((function (arr, x) {
                    arr[x.series] = x.isdefault;
                    return arr;
                }), {});
                seriesinput.val(JSON.stringify(data));
            },
            dataLoaded: function (data) {
                // Load series titles.
                loadSeriesTitles(contextid, ocinstanceid, data.map(x => x['series']), this);
            },
            columns: [
                {title: jsstrings[0], field: "seriesname", editable: false},
                {title: jsstrings[1], field: "series", editable: false},
                {
                    title: jsstrings[2], field: "isdefault",
                    hozAlign: "center",
                    widthGrow: 0,
                    formatter: function (cell) {
                        var input = document.createElement('input');
                        input.type = 'checkbox';
                        input.checked = cell.getValue();
                        input.addEventListener('click', function () {
                            cell.getRow().update({'isdefault': $(this).prop('checked') ? 1 : 0});
                        });
                        return input;
                    }
                },
                {
                    title: "", width: 40, headerSort: false, hozAlign: "center", formatter:
                        function () {
                            return '<i class="icon fa fa-edit fa-fw"></i>';
                        },
                    cellClick: function (_, cell) {
                        var formdata = "series=" + cell.getRow().getCell("series").getValue();
                        ModalFactory.create({
                            type: ModalFactory.types.SAVE_CANCEL,
                            title: jsstrings[7],
                            body: getBody(contextid, ocinstanceid, formdata)
                        })
                            .then(function (modal) {
                                modal.setSaveButtonText(jsstrings[7]);
                                modal.setLarge();

                                // Reset modal on every open event.
                                modal.getRoot().on(ModalEvents.hidden, function () {
                                    modal.destroy();
                                }).bind(this);

                                // We want to hide the submit buttons every time it is opened.
                                modal.getRoot().on(ModalEvents.shown, function () {
                                    modal.getRoot().append('<style>[data-fieldtype=submit] { display: none ! important; }</style>');
                                }.bind(this));

                                modal.getRoot().on(ModalEvents.save, function (e) {
                                    e.preventDefault();
                                    modal.getRoot().find('form').submit();
                                });
                                modal.getRoot().on('submit', 'form', {'modal': modal, 'contextid': contextid}, submitFormAjax);

                                modal.show();
                            });
                    }
                },
                {
                    title: "", width: 40, headerSort: false, hozAlign: "center", formatter:
                        function () {
                            return '<i class="icon fa fa-trash fa-fw"></i>';
                        },
                    cellClick: function (e, cell) {
                        ModalFactory.create({
                            type: ModalFactory.types.SAVE_CANCEL,
                            title: jsstrings[5],
                            body: jsstrings[6]
                        })
                            .then(function (modal) {
                                modal.setSaveButtonText(jsstrings[8]);
                                modal.getRoot().on(ModalEvents.save, function () {
                                    cell.getRow().delete();
                                });
                                modal.show();
                            });
                    }
                }
            ],
        });

        // Create new series in modal
        // Button for connection a new series
        $('#createseries').click(function () {
            ModalFactory.create({
                type: ModalFactory.types.SAVE_CANCEL,
                title: jsstrings[4],
                body: getBody(contextid, ocinstanceid)
            })
                .then(function (modal) {
                    modal.setSaveButtonText(jsstrings[4]);
                    modal.setLarge();

                    // Reset modal on every open event.
                    modal.getRoot().on(ModalEvents.hidden, function () {
                        modal.setBody(getBody(contextid, ocinstanceid));
                    }).bind(this);

                    // We want to hide the submit buttons every time it is opened.
                    modal.getRoot().on(ModalEvents.shown, function () {
                        modal.getRoot().append('<style>[data-fieldtype=submit] { display: none ! important; }</style>');
                    }.bind(this));

                    modal.getRoot().on(ModalEvents.save, function (e) {
                        e.preventDefault();
                        modal.getRoot().find('form').submit();
                    });
                    modal.getRoot().on('submit', 'form', {'modal': modal, 'contextid': contextid,
                        'ocinstanceid': ocinstanceid,
                        'seriestable': seriestable}, submitFormAjax);

                    modal.show();
                });

        });

        // Import new series in modal
        $('#importseries').click(function () {
            ModalFactory.create({
                type: ModalFactory.types.SAVE_CANCEL,
                title: jsstrings[10],
                body: '<p><input type="text" id="importseriesid"></p>'
            })
                .then(function (modal) {
                    modal.setSaveButtonText(jsstrings[10]);
                    modal.setLarge();

                    modal.getRoot().on(ModalEvents.save, function (e) {
                        e.preventDefault();
                        var seriesid = $('#importseriesid').val();

                        // Submit form.
                        Ajax.call([{
                            methodname: 'block_opencast_import_series',
                            args: {contextid: contextid, ocinstanceid: ocinstanceid, seriesid: seriesid},
                            done: function (newseries) {
                                modal.destroy();
                                if(seriestable !== undefined) {
                                    var s = JSON.parse(newseries);
                                    seriestable.addRow({'seriesname': s.title, 'series':s.id, 'isdefault': s.isdefault});
                                }
                            },
                            fail: function () {
                                modal.destroy();
                                var context = {
                                    announce: true,
                                    closebutton: true,
                                    extraclasses: "",
                                    message: jsstrings[11]
                                };

                                Templates.render("core/notification_error", context).then(function (html){
                                    $('#user-notifications').append(html);
                                }).fail(function() {
                                    Notification.alert(jsstrings[11], jsstrings[11]);
                                });
                            }
                        }]);
                    });

                    modal.show();
                });

        });
    });
};

